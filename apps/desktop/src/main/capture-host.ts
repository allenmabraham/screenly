import { type BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { type FileHandle, open, rm } from "node:fs/promises";

import type { Rect } from "../core/capture-geometry";
import {
  CHANNELS,
  type CaptureCommand,
  type CaptureEvent,
  type CapturePrepared,
  type CaptureReply,
  type CaptureStartConfig,
} from "../shared/ipc";
import { createPageWindow } from "./windows";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export type CaptureEventHandler = (event: CaptureEvent) => void;

/**
 * Hosts one recording in a hidden renderer. Chromium owns capture and
 * encoding; this class owns the output file and the command protocol.
 */
export class CaptureHost {
  private window: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private nextID = 1;
  private readonly pending = new Map<number, Pending>();
  private file: FileHandle | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private writeError: Error | null = null;
  private bytesWritten = 0;

  constructor(private readonly onEvent: CaptureEventHandler) {
    ipcMain.on(CHANNELS.captureReply, this.handleReply);
    ipcMain.on(CHANNELS.captureEvent, this.handleEvent);
    ipcMain.handle(CHANNELS.captureChunk, this.handleChunk);
  }

  /**
   * Acquires every capture source and opens `<outputBasePath><extension>`
   * for the encoder format the renderer selected.
   */
  async prepare(config: CaptureStartConfig, outputBasePath: string) {
    await this.dispose();
    this.writeQueue = Promise.resolve();
    this.writeError = null;
    this.bytesWritten = 0;

    const window = createPageWindow("capture", {
      width: 320,
      height: 240,
      show: false,
      skipTaskbar: true,
      webPreferences: { backgroundThrottling: false },
    });
    this.window = window;
    this.ready = new Promise<void>((resolve, reject) => {
      window.webContents.once("did-finish-load", () => resolve());
      window.webContents.once("did-fail-load", (_event, _code, description) =>
        reject(new Error(`The capture surface failed to load: ${description}`)),
      );
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      this.rejectAll(new Error(`The capture process stopped (${details.reason}).`));
      this.onEvent({
        type: "error",
        message: "The recording stopped unexpectedly. Try recording again.",
      });
    });

    const prepared = (await this.send({ type: "prepare", config })) as CapturePrepared;
    const filePath = `${outputBasePath}${prepared.format.extension}`;
    this.file = await open(filePath, "w", 0o600);
    return { ...prepared, filePath };
  }

  async start() {
    await this.send({ type: "start" });
  }

  async pause() {
    await this.send({ type: "pause" });
  }

  async resume() {
    await this.send({ type: "resume" });
  }

  updateWebcamFrame(frame: Rect) {
    if (this.window && !this.window.isDestroyed()) {
      void this.send({ type: "webcamFrame", frame }).catch(() => undefined);
    }
  }

  /** Stops the recording and resolves once every byte is on disk. */
  async stop() {
    await this.send({ type: "stop" });
    await this.writeQueue;
    const error = this.writeError;
    const bytes = this.bytesWritten;
    await this.closeFile();
    await this.destroyWindow();
    if (error) {
      throw error;
    }
    if (bytes === 0) {
      throw new Error("The recording did not contain any video.");
    }
    return bytes;
  }

  /** Abandons the capture. The caller removes the output file. */
  async dispose() {
    if (this.window && !this.window.isDestroyed()) {
      await this.send({ type: "cancel" }).catch(() => undefined);
    }
    await this.writeQueue.catch(() => undefined);
    await this.closeFile();
    await this.destroyWindow();
  }

  private async send(command: CaptureCommand) {
    const window = this.window;
    if (!window || window.isDestroyed() || !this.ready) {
      throw new Error("The recording encoder was not started.");
    }
    await this.ready;
    const id = this.nextID++;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      window.webContents.send(CHANNELS.captureCommand, { id, command });
    });
  }

  private readonly handleReply = (event: IpcMainEvent, reply: CaptureReply) => {
    if (!this.isCaptureSender(event)) {
      return;
    }
    const pending = this.pending.get(reply.id);
    if (!pending) {
      return;
    }
    this.pending.delete(reply.id);
    if (reply.ok) {
      pending.resolve(reply.value);
    } else {
      pending.reject(new Error(reply.message));
    }
  };

  private readonly handleEvent = (event: IpcMainEvent, payload: CaptureEvent) => {
    if (this.isCaptureSender(event)) {
      this.onEvent(payload);
    }
  };

  private readonly handleChunk = (
    event: IpcMainInvokeEvent,
    chunk: ArrayBuffer,
  ) => {
    if (!this.isCaptureSender(event) || !(chunk instanceof ArrayBuffer)) {
      return;
    }
    const file = this.file;
    const data = new Uint8Array(chunk);
    this.writeQueue = this.writeQueue.then(async () => {
      if (!file || this.writeError || data.byteLength === 0) {
        return;
      }
      try {
        await file.write(data);
        this.bytesWritten += data.byteLength;
      } catch (error) {
        this.writeError =
          error instanceof Error ? error : new Error("The recording could not be saved.");
        this.onEvent({
          type: "error",
          message: "The recording could not be saved to disk. Check free space and try again.",
        });
      }
    });
    return this.writeQueue;
  };

  private isCaptureSender(event: IpcMainEvent | IpcMainInvokeEvent) {
    return (
      this.window !== null &&
      !this.window.isDestroyed() &&
      event.sender === this.window.webContents
    );
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private async closeFile() {
    const file = this.file;
    this.file = null;
    if (file) {
      await file.close().catch(() => undefined);
    }
  }

  private async destroyWindow() {
    const window = this.window;
    this.window = null;
    this.ready = null;
    this.rejectAll(new Error("The recording was cancelled."));
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
  }
}

export async function removeFile(filePath: string) {
  await rm(filePath, { force: true }).catch(() => undefined);
}
