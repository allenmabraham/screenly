import {
  type FetchLike,
  readErrorMessage,
  statusText,
  withTimeout,
} from "./http";
import { joinServerPath } from "./server-url";

export type InitiateUploadResponse = {
  videoId: string;
  slug: string;
  shareUrl: string;
  uploadId: string;
  partSizeBytes: number;
  partCount: number;
};

export type SignedUploadPart = {
  partNumber: number;
  url: string;
};

export type CompletedUploadPart = {
  partNumber: number;
  etag: string;
};

export type UploadErrorKind =
  | "cannotReadRecording"
  | "invalidPartResponse"
  | "invalidResponse"
  | "server";

export class UploadError extends Error {
  readonly kind: UploadErrorKind;
  readonly status: number | null;

  constructor(kind: UploadErrorKind, message?: string, status?: number) {
    super(message ?? UploadError.defaultMessage(kind));
    this.name = "UploadError";
    this.kind = kind;
    this.status = status ?? null;
  }

  private static defaultMessage(kind: UploadErrorKind) {
    switch (kind) {
      case "cannotReadRecording":
        return "The recording file could not be read.";
      case "invalidPartResponse":
        return "Object storage did not accept an upload part.";
      case "invalidResponse":
        return "The server returned an invalid response.";
      case "server":
        return "Upload failed.";
    }
  }
}

export type UploadClientConfiguration = {
  baseURL: string;
  token: string;
  workspaceID: string | null;
};

export class UploadAPIClient {
  readonly baseURL: string;
  readonly workspaceID: string | null;
  private readonly token: string;

  constructor(
    configuration: UploadClientConfiguration,
    private readonly fetchImpl: FetchLike,
  ) {
    this.baseURL = configuration.baseURL;
    this.token = configuration.token;
    this.workspaceID = configuration.workspaceID;
  }

  async initiate(
    input: {
      fileName: string;
      contentType: string;
      sizeBytes: number;
      recorderName: string;
    },
    signal?: AbortSignal,
  ) {
    const recorderName = input.recorderName.trim().slice(0, 120);
    const response = await this.send(
      "api/uploads",
      {
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        title: "Screen recording",
        ...(recorderName ? { recorderName } : {}),
      },
      signal,
    );
    if (!isInitiateUploadResponse(response)) {
      throw new UploadError("invalidResponse");
    }
    return response;
  }

  async signParts(
    videoId: string,
    partNumbers: number[],
    signal?: AbortSignal,
  ) {
    const response = await this.send(
      `api/uploads/${videoId}/parts`,
      { partNumbers },
      signal,
    );
    if (
      !isObject(response) ||
      !Array.isArray(response.parts) ||
      !response.parts.every(isSignedUploadPart)
    ) {
      throw new UploadError("invalidResponse");
    }
    return response.parts as SignedUploadPart[];
  }

  async complete(
    videoId: string,
    parts: CompletedUploadPart[],
    signal?: AbortSignal,
  ) {
    await this.send(`api/uploads/${videoId}/complete`, { parts }, signal);
  }

  async discard(videoId: string, signal?: AbortSignal) {
    const response = await this.fetchImpl(
      joinServerPath(this.baseURL, `api/uploads/${videoId}`),
      {
        method: "DELETE",
        headers: this.headers(),
        signal: withTimeout(signal, 60_000),
      },
    );
    await this.validate(response);
  }

  private async send(path: string, body: unknown, signal?: AbortSignal) {
    const response = await this.fetchImpl(joinServerPath(this.baseURL, path), {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: withTimeout(signal, 60_000),
    });
    await this.validate(response);
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new UploadError("invalidResponse");
    }
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  private async validate(response: Response) {
    if (response.ok) {
      return;
    }
    const message =
      (await readErrorMessage(response)) ?? statusText(response.status);
    throw new UploadError(
      "server",
      `Upload failed (${response.status}): ${message}`,
      response.status,
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isInitiateUploadResponse(
  value: unknown,
): value is InitiateUploadResponse {
  if (!isObject(value)) {
    return false;
  }
  if (
    typeof value.videoId !== "string" ||
    typeof value.slug !== "string" ||
    typeof value.shareUrl !== "string" ||
    typeof value.uploadId !== "string" ||
    !isPositiveInteger(value.partSizeBytes) ||
    !isPositiveInteger(value.partCount)
  ) {
    return false;
  }
  try {
    new URL(value.shareUrl);
    return true;
  } catch {
    return false;
  }
}

function isSignedUploadPart(value: unknown): value is SignedUploadPart {
  return (
    isObject(value) &&
    isPositiveInteger(value.partNumber) &&
    typeof value.url === "string"
  );
}
