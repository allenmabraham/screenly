import { open, stat } from "node:fs/promises";
import path from "node:path";

import {
  type UploadCheckpoint,
  type UploadCheckpointStore,
  matchesDestination,
} from "./checkpoint-store";
import {
  type FetchLike,
  CancellationError,
  isCancellation,
  sleep,
  throwIfCancelled,
  withTimeout,
} from "./http";
import {
  type CompletedUploadPart,
  type UploadAPIClient,
  UploadError,
} from "./upload-api";

export type UploadReceipt = {
  videoId: string;
  slug: string;
  shareURL: string;
};

export type UploadRequest = {
  filePath: string;
  contentType: string;
  recorderName: string;
  signal?: AbortSignal;
  onInitiated?: (receipt: UploadReceipt) => void;
  onProgress?: (fraction: number) => void;
};

export type UploaderOptions = {
  maximumAttempts?: number;
  signedPartBatchSize?: number;
  retryDelayMs?: (attempt: number) => number;
  partTimeoutMs?: number;
};

export class MultipartUploader {
  private readonly maximumAttempts: number;
  private readonly signedPartBatchSize: number;
  private readonly retryDelayMs: (attempt: number) => number;
  private readonly partTimeoutMs: number;

  constructor(
    private readonly checkpoints: UploadCheckpointStore,
    private readonly fetchImpl: FetchLike,
    options: UploaderOptions = {},
  ) {
    this.maximumAttempts = options.maximumAttempts ?? 4;
    this.signedPartBatchSize = options.signedPartBatchSize ?? 20;
    this.retryDelayMs =
      options.retryDelayMs ?? ((attempt) => 1_000 * 2 ** (attempt - 1));
    this.partTimeoutMs = options.partTimeoutMs ?? 10 * 60_000;
  }

  async upload(
    client: UploadAPIClient,
    request: UploadRequest,
  ): Promise<UploadReceipt> {
    const { filePath, signal } = request;
    let fileSize: number;
    try {
      fileSize = (await stat(filePath)).size;
    } catch {
      throw new UploadError("cannotReadRecording");
    }
    if (fileSize <= 0) {
      throw new UploadError("cannotReadRecording");
    }

    let checkpoint = await this.checkpoints.find(
      filePath,
      client.baseURL,
      client.workspaceID,
    );
    if (!checkpoint) {
      const initiation = await this.withRetry(signal, () =>
        client.initiate(
          {
            fileName: path.basename(filePath),
            contentType: request.contentType,
            sizeBytes: fileSize,
            recorderName: request.recorderName,
          },
          signal,
        ),
      );
      checkpoint = {
        filePath,
        contentType: request.contentType,
        serverURL: client.baseURL,
        workspaceID: client.workspaceID,
        initiation,
        completedParts: [],
        uploadedBytes: 0,
      };
      await this.checkpoints.save(checkpoint);
    }

    const { initiation } = checkpoint;
    const receipt: UploadReceipt = {
      videoId: initiation.videoId,
      slug: initiation.slug,
      shareURL: initiation.shareUrl,
    };
    request.onInitiated?.(receipt);
    request.onProgress?.(progressFraction(checkpoint.uploadedBytes, fileSize));

    const handle = await open(filePath, "r");
    try {
      await this.uploadRemainingParts(client, checkpoint, handle, fileSize, request);
    } finally {
      await handle.close();
    }

    await this.withRetry(signal, () =>
      client.complete(initiation.videoId, checkpoint.completedParts, signal),
    );
    await this.checkpoints.remove(initiation.videoId);
    request.onProgress?.(1);
    return receipt;
  }

  async pendingFiles(client: UploadAPIClient) {
    const checkpoints = await this.checkpoints.all();
    const pending: UploadCheckpoint[] = [];
    for (const checkpoint of checkpoints) {
      if (!matchesDestination(checkpoint, client.baseURL, client.workspaceID)) {
        continue;
      }
      try {
        await stat(checkpoint.filePath);
        pending.push(checkpoint);
      } catch {
        await this.checkpoints.remove(checkpoint.initiation.videoId);
      }
    }
    return pending;
  }

  async discard(client: UploadAPIClient, filePath: string) {
    const checkpoint = await this.checkpoints.find(
      filePath,
      client.baseURL,
      client.workspaceID,
    );
    if (!checkpoint) {
      return;
    }
    try {
      await client.discard(checkpoint.initiation.videoId);
    } catch {
      // The server expires abandoned multipart uploads; local cleanup wins.
    }
    await this.checkpoints.remove(checkpoint.initiation.videoId);
  }

  private async uploadRemainingParts(
    client: UploadAPIClient,
    checkpoint: UploadCheckpoint,
    handle: Awaited<ReturnType<typeof open>>,
    fileSize: number,
    request: UploadRequest,
  ) {
    const { initiation } = checkpoint;
    const { signal } = request;

    for (
      let batchStart = checkpoint.completedParts.length + 1;
      batchStart <= initiation.partCount;
      batchStart += this.signedPartBatchSize
    ) {
      throwIfCancelled(signal);
      const batchEnd = Math.min(
        initiation.partCount,
        batchStart + this.signedPartBatchSize - 1,
      );
      const partNumbers = Array.from(
        { length: batchEnd - batchStart + 1 },
        (_, index) => batchStart + index,
      );
      const signedParts = await this.withRetry(signal, () =>
        client.signParts(initiation.videoId, partNumbers, signal),
      );
      const signedByNumber = new Map(
        signedParts.map((part) => [part.partNumber, part.url]),
      );

      for (const partNumber of partNumbers) {
        throwIfCancelled(signal);
        const signedURL = signedByNumber.get(partNumber);
        if (!signedURL) {
          throw new UploadError("invalidPartResponse");
        }
        const data = await readPart(
          handle,
          partNumber,
          initiation.partSizeBytes,
          fileSize,
        );
        if (data.byteLength === 0) {
          throw new UploadError("invalidPartResponse");
        }

        const etag = await this.withRetry(signal, () =>
          this.uploadPart(data, signedURL, signal),
        );
        const completed: CompletedUploadPart = { partNumber, etag };
        checkpoint.completedParts = [...checkpoint.completedParts, completed];
        checkpoint.uploadedBytes += data.byteLength;
        await this.checkpoints.save(checkpoint);
        request.onProgress?.(
          progressFraction(checkpoint.uploadedBytes, fileSize),
        );
      }
    }
  }

  private async uploadPart(
    data: Uint8Array<ArrayBuffer>,
    url: string,
    signal?: AbortSignal,
  ) {
    const response = await this.fetchImpl(url, {
      method: "PUT",
      body: data,
      signal: withTimeout(signal, this.partTimeoutMs),
    });
    const etag = response.headers.get("etag");
    if (!response.ok || !etag) {
      throw new UploadError("invalidPartResponse");
    }
    return etag;
  }

  private async withRetry<T>(
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maximumAttempts; attempt += 1) {
      throwIfCancelled(signal);
      try {
        return await operation();
      } catch (error) {
        if (isCancellation(error, signal)) {
          throw new CancellationError();
        }
        if (!isRetryable(error)) {
          throw error;
        }
        lastError = error;
        if (attempt < this.maximumAttempts) {
          await sleep(this.retryDelayMs(attempt), signal);
        }
      }
    }
    throw lastError ?? new UploadError("invalidResponse");
  }
}

async function readPart(
  handle: Awaited<ReturnType<typeof open>>,
  partNumber: number,
  partSizeBytes: number,
  fileSize: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const offset = (partNumber - 1) * partSizeBytes;
  const length = Math.max(0, Math.min(partSizeBytes, fileSize - offset));
  const buffer = new Uint8Array(length);
  let bytesRead = 0;
  while (bytesRead < length) {
    const result = await handle.read(
      buffer,
      bytesRead,
      length - bytesRead,
      offset + bytesRead,
    );
    if (result.bytesRead === 0) {
      break;
    }
    bytesRead += result.bytesRead;
  }
  return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
}

function isRetryable(error: unknown) {
  if (error instanceof UploadError && error.kind === "server") {
    const status = error.status ?? 0;
    return status === 408 || status === 429 || status >= 500;
  }
  return true;
}

function progressFraction(uploadedBytes: number, fileSize: number) {
  return fileSize > 0 ? Math.min(1, uploadedBytes / fileSize) : 0;
}
