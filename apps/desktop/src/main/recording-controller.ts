import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { Rect } from "../core/capture-geometry";
import { CancellationError, type FetchLike, sleep } from "../core/http";
import type { MultipartUploader, UploadReceipt } from "../core/multipart-uploader";
import {
  type RecordingState,
  isTerminalState,
} from "../core/recording-state";
import { isAllowedServerURL } from "../core/server-url";
import type { RecorderSettings } from "../core/settings";
import { UploadAPIClient } from "../core/upload-api";
import type { CaptureEvent, CaptureStartConfig } from "../shared/ipc";
import { CaptureHost, removeFile } from "./capture-host";

export type RecordingPlan = {
  requires: { microphone: boolean; camera: boolean };
  /** Runs while "preparing", so it may show a system picker. */
  prepareConfig: () => Promise<CaptureStartConfig>;
};

export type RecordingHooks = {
  onShareLink: (receipt: UploadReceipt, opensSharePage: boolean) => void;
  checkMediaAccess: (requires: RecordingPlan["requires"]) => string | null;
};

type CurrentRecording = {
  filePath: string;
  contentType: string;
};

export class RecordingController {
  private stateValue: RecordingState = { kind: "idle" };
  private elapsedMs = 0;
  private resumedAt: number | null = null;
  private ticker: NodeJS.Timeout | null = null;
  private current: CurrentRecording | null = null;
  private startAbort: AbortController | null = null;
  private uploadAbort: AbortController | null = null;
  private finishing: Promise<void> | null = null;
  private readonly capture: CaptureHost;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly settings: RecorderSettings,
    private readonly uploader: MultipartUploader,
    private readonly fetchImpl: FetchLike,
    private readonly recordingsDirectory: string,
    private readonly hooks: RecordingHooks,
  ) {
    this.capture = new CaptureHost((event) => this.handleCaptureEvent(event));
  }

  get state() {
    return this.stateValue;
  }

  get elapsedSeconds() {
    const running = this.resumedAt === null ? 0 : Date.now() - this.resumedAt;
    return Math.floor((this.elapsedMs + running) / 1_000);
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(plan: RecordingPlan) {
    const state = this.stateValue;
    if (state.kind !== "idle" && !isTerminalState(state)) {
      return;
    }
    if (!this.makeClient()) {
      this.setState({
        kind: "failed",
        message: "Sign in or add a server and recorder token in Settings.",
      });
      return;
    }
    const accessProblem = this.hooks.checkMediaAccess(plan.requires);
    if (accessProblem) {
      this.setState({ kind: "failed", message: accessProblem });
      return;
    }

    this.uploadAbort?.abort();
    const abort = new AbortController();
    this.startAbort = abort;
    void this.runStart(plan, abort.signal);
  }

  pauseOrResume() {
    if (this.stateValue.kind === "recording") {
      void this.capture.pause().catch((error) => this.fail(error));
      this.stopClock();
      this.setState({ kind: "paused" });
    } else if (this.stateValue.kind === "paused") {
      void this.capture.resume().catch((error) => this.fail(error));
      this.startClock();
      this.setState({ kind: "recording" });
    }
  }

  stop() {
    if (this.stateValue.kind !== "recording" && this.stateValue.kind !== "paused") {
      return;
    }
    this.stopClock();
    this.setState({ kind: "finishing" });
    this.finishing = (async () => {
      try {
        await this.capture.stop();
      } catch (error) {
        this.fail(error);
        return;
      } finally {
        this.finishing = null;
      }
      if (this.current && this.stateValue.kind === "finishing") {
        this.beginUpload(this.current, true);
      }
    })();
  }

  discard() {
    const client = this.makeClient();
    const current = this.current;
    const pendingFinish = this.finishing;
    this.startAbort?.abort();
    this.uploadAbort?.abort();
    this.stopClock();
    this.current = null;

    void (async () => {
      await pendingFinish?.catch(() => undefined);
      await this.capture.dispose();
      if (current) {
        if (client) {
          await this.uploader.discard(client, current.filePath);
        }
        await removeFile(current.filePath);
      }
      this.elapsedMs = 0;
      this.setState({ kind: "idle" });
    })();
  }

  reset() {
    if (!isTerminalState(this.stateValue)) {
      return;
    }
    this.elapsedMs = 0;
    this.setState({ kind: "idle" });
  }

  retryUpload() {
    if (this.stateValue.kind !== "failed" || !this.current) {
      return;
    }
    this.beginUpload(this.current, false);
  }

  updateWebcamFrame(frame: Rect) {
    this.capture.updateWebcamFrame(frame);
  }

  async resumePendingUploads() {
    const client = this.makeClient();
    if (!client || this.stateValue.kind !== "idle") {
      return;
    }
    const [checkpoint] = await this.uploader.pendingFiles(client);
    if (!checkpoint || this.stateValue.kind !== "idle") {
      return;
    }
    this.current = {
      filePath: checkpoint.filePath,
      contentType: checkpoint.contentType,
    };
    this.beginUpload(this.current, false);
  }

  /** Stops background work at quit; pending uploads resume on next launch. */
  shutdown() {
    this.startAbort?.abort();
    this.uploadAbort?.abort();
    this.stopClock();
  }

  private async runStart(plan: RecordingPlan, signal: AbortSignal) {
    let filePath: string | null = null;
    try {
      this.setState({ kind: "preparing" });
      const config = await plan.prepareConfig();
      throwIfAborted(signal);

      await mkdir(this.recordingsDirectory, { recursive: true });
      const prepared = await this.capture.prepare(
        config,
        path.join(this.recordingsDirectory, randomUUID()),
      );
      filePath = prepared.filePath;
      throwIfAborted(signal);

      for (let count = 3; count >= 1; count -= 1) {
        this.setState({ kind: "countdown", count });
        await sleep(1_000, signal);
      }

      await this.capture.start();
      throwIfAborted(signal);
      this.current = { filePath, contentType: prepared.format.contentType };
      this.elapsedMs = 0;
      this.startClock();
      this.setState({ kind: "recording" });
    } catch (error) {
      if (signal.aborted || error instanceof CancellationError) {
        await this.capture.dispose();
        if (filePath) {
          await removeFile(filePath);
        }
        if (!this.current) {
          this.setState({ kind: "idle" });
        }
        return;
      }
      await this.capture.dispose();
      if (filePath) {
        await removeFile(filePath);
      }
      this.current = null;
      this.setState({ kind: "failed", message: messageFor(error) });
    } finally {
      if (this.startAbort?.signal === signal) {
        this.startAbort = null;
      }
    }
  }

  private beginUpload(recording: CurrentRecording, opensSharePage: boolean) {
    const client = this.makeClient();
    if (!client) {
      this.setState({ kind: "failed", message: "The upload server is not configured." });
      return;
    }

    this.uploadAbort?.abort();
    const abort = new AbortController();
    this.uploadAbort = abort;
    this.setState({ kind: "uploading", progress: 0 });

    void (async () => {
      const { filePath } = recording;
      try {
        const receipt = await this.uploader.upload(client, {
          filePath,
          contentType: recording.contentType,
          recorderName: this.settings.recorderName,
          signal: abort.signal,
          onInitiated: (value) => {
            if (!abort.signal.aborted) {
              this.hooks.onShareLink(value, opensSharePage);
            }
          },
          onProgress: (progress) => {
            if (!abort.signal.aborted) {
              this.setState({ kind: "uploading", progress });
            }
          },
        });
        await removeFile(filePath);
        if (this.current?.filePath === filePath) {
          this.current = null;
        }
        this.setState({ kind: "uploaded", shareURL: receipt.shareURL });
      } catch (error) {
        if (abort.signal.aborted || error instanceof CancellationError) {
          return;
        }
        this.setState({ kind: "failed", message: messageFor(error) });
      } finally {
        if (this.uploadAbort === abort) {
          this.uploadAbort = null;
        }
      }
    })();
  }

  private handleCaptureEvent(event: CaptureEvent) {
    if (event.type === "sourceEnded") {
      if (this.stateValue.kind === "recording" || this.stateValue.kind === "paused") {
        this.stop();
      }
      return;
    }
    if (
      this.stateValue.kind === "recording" ||
      this.stateValue.kind === "paused" ||
      this.stateValue.kind === "countdown" ||
      this.stateValue.kind === "preparing"
    ) {
      this.fail(new Error(event.message));
    }
  }

  private fail(error: unknown) {
    this.stopClock();
    this.startAbort?.abort();
    const current = this.current;
    this.current = null;
    void this.capture.dispose().then(async () => {
      if (current) {
        await removeFile(current.filePath);
      }
    });
    this.setState({ kind: "failed", message: messageFor(error) });
  }

  private makeClient() {
    const { serverURL, apiToken, activeWorkspaceID } = this.settings;
    if (!isAllowedServerURL(serverURL) || !apiToken) {
      return null;
    }
    return new UploadAPIClient(
      { baseURL: serverURL, token: apiToken, workspaceID: activeWorkspaceID },
      this.fetchImpl,
    );
  }

  private startClock() {
    this.resumedAt = Date.now();
    this.ticker ??= setInterval(() => this.emit(), 1_000);
  }

  private stopClock() {
    if (this.resumedAt !== null) {
      this.elapsedMs += Date.now() - this.resumedAt;
      this.resumedAt = null;
    }
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private setState(state: RecordingState) {
    this.stateValue = state;
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new CancellationError();
  }
}

function messageFor(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Try again.";
}
