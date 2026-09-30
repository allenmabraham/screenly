import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type CompletedUploadPart,
  type InitiateUploadResponse,
  isInitiateUploadResponse,
} from "./upload-api";

export type UploadCheckpoint = {
  filePath: string;
  contentType: string;
  serverURL: string;
  workspaceID: string | null;
  initiation: InitiateUploadResponse;
  completedParts: CompletedUploadPart[];
  uploadedBytes: number;
};

export class UploadCheckpointStore {
  constructor(private readonly directory: string) {}

  async find(filePath: string, serverURL: string, workspaceID: string | null) {
    const checkpoints = await this.all();
    return (
      checkpoints.find(
        (checkpoint) =>
          checkpoint.filePath === filePath &&
          matchesDestination(checkpoint, serverURL, workspaceID),
      ) ?? null
    );
  }

  async all() {
    let entries: string[];
    try {
      entries = await readdir(this.directory);
    } catch {
      return [];
    }

    const checkpoints: UploadCheckpoint[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".json")) {
        continue;
      }
      try {
        const value: unknown = JSON.parse(
          await readFile(path.join(this.directory, entry), "utf8"),
        );
        if (isUploadCheckpoint(value)) {
          checkpoints.push(value);
        }
      } catch {
        // A partially written or foreign file is not a resumable upload.
      }
    }
    return checkpoints;
  }

  async save(checkpoint: UploadCheckpoint) {
    await mkdir(this.directory, { recursive: true });
    const destination = this.fileFor(checkpoint.initiation.videoId);
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(checkpoint), { mode: 0o600 });
    await rename(temporary, destination);
  }

  async remove(videoId: string) {
    await rm(this.fileFor(videoId), { force: true });
  }

  private fileFor(videoId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(videoId)) {
      throw new Error("Invalid video identifier.");
    }
    return path.join(this.directory, `${videoId.toLowerCase()}.json`);
  }
}

export function matchesDestination(
  checkpoint: UploadCheckpoint,
  serverURL: string,
  workspaceID: string | null,
) {
  return (
    checkpoint.serverURL === serverURL &&
    (checkpoint.workspaceID === null || checkpoint.workspaceID === workspaceID)
  );
}

function isUploadCheckpoint(value: unknown): value is UploadCheckpoint {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const checkpoint = value as Record<string, unknown>;
  return (
    typeof checkpoint.filePath === "string" &&
    typeof checkpoint.contentType === "string" &&
    typeof checkpoint.serverURL === "string" &&
    (checkpoint.workspaceID === null ||
      typeof checkpoint.workspaceID === "string") &&
    isInitiateUploadResponse(checkpoint.initiation) &&
    Array.isArray(checkpoint.completedParts) &&
    checkpoint.completedParts.every(
      (part) =>
        typeof part === "object" &&
        part !== null &&
        typeof (part as CompletedUploadPart).partNumber === "number" &&
        typeof (part as CompletedUploadPart).etag === "string",
    ) &&
    typeof checkpoint.uploadedBytes === "number"
  );
}
