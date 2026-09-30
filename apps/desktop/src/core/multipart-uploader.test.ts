import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { UploadCheckpointStore } from "./checkpoint-store";
import { CancellationError, type FetchLike } from "./http";
import { MultipartUploader } from "./multipart-uploader";
import { UploadAPIClient, UploadError } from "./upload-api";
import { jsonResponse } from "./test-support";

const VIDEO_ID = "3f1b0f5e-8d4c-4d8e-9a57-3c1d6f0b2a11";
const SERVER = "https://video.example.com";

class FakeScreenly {
  readonly storedParts = new Map<number, Uint8Array>();
  readonly requests: string[] = [];
  completedParts: unknown = null;
  initiateBody: Record<string, unknown> | null = null;
  failPartAttempts = new Map<number, number>();
  initiateStatus = 201;
  onPartUploaded: ((partNumber: number) => void) | null = null;

  constructor(private readonly partSize: number, private readonly partCount: number) {}

  fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    const { pathname } = new URL(url);
    this.requests.push(`${method} ${pathname}`);

    if (pathname === "/api/uploads" && method === "POST") {
      this.initiateBody = JSON.parse(String(init?.body));
      if (this.initiateStatus !== 201) {
        return jsonResponse(this.initiateStatus, {
          error: { message: "Recorder token revoked." },
        });
      }
      return jsonResponse(201, {
        videoId: VIDEO_ID,
        slug: "abc123",
        shareUrl: `${SERVER}/v/abc123`,
        uploadId: "upload-1",
        partSizeBytes: this.partSize,
        partCount: this.partCount,
      });
    }
    if (pathname === `/api/uploads/${VIDEO_ID}/parts`) {
      const { partNumbers } = JSON.parse(String(init?.body)) as {
        partNumbers: number[];
      };
      return jsonResponse(200, {
        parts: partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://storage.example.com/part/${partNumber}`,
        })),
      });
    }
    if (pathname.startsWith("/part/") && method === "PUT") {
      const partNumber = Number(pathname.split("/").at(-1));
      const failures = this.failPartAttempts.get(partNumber) ?? 0;
      if (failures > 0) {
        this.failPartAttempts.set(partNumber, failures - 1);
        return new Response(null, { status: 503 });
      }
      this.storedParts.set(partNumber, new Uint8Array(init?.body as Uint8Array));
      this.onPartUploaded?.(partNumber);
      return new Response(null, {
        status: 200,
        headers: { ETag: `"etag-${partNumber}"` },
      });
    }
    if (pathname === `/api/uploads/${VIDEO_ID}/complete`) {
      this.completedParts = JSON.parse(String(init?.body)).parts;
      return jsonResponse(202, { videoId: VIDEO_ID, slug: "abc123", status: "processing" });
    }
    if (pathname === `/api/uploads/${VIDEO_ID}` && method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    return jsonResponse(404, { error: { message: "Not found" } });
  };

  reassembled() {
    const numbers = [...this.storedParts.keys()].sort((a, b) => a - b);
    return Buffer.concat(numbers.map((number) => this.storedParts.get(number)!));
  }
}

async function setup(fileBytes: number, partSize: number) {
  const directory = await mkdtemp(path.join(tmpdir(), "screenly-upload-"));
  const filePath = path.join(directory, "recording.mp4");
  const contents = Buffer.alloc(fileBytes);
  for (let index = 0; index < fileBytes; index += 1) {
    contents[index] = index % 251;
  }
  await writeFile(filePath, contents);
  const checkpointDirectory = path.join(directory, "Uploads");
  const store = new UploadCheckpointStore(checkpointDirectory);
  const server = new FakeScreenly(partSize, Math.ceil(fileBytes / partSize));
  const client = new UploadAPIClient(
    { baseURL: SERVER, token: "recorder-token", workspaceID: "workspace-1" },
    server.fetch,
  );
  const uploader = new MultipartUploader(store, server.fetch, {
    retryDelayMs: () => 1,
    signedPartBatchSize: 2,
  });
  return {
    directory,
    filePath,
    contents,
    checkpointDirectory,
    store,
    server,
    client,
    uploader,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

test("uploads every part, reports the share link first, then completes", async () => {
  const context = await setup(2_500, 1_000);
  try {
    const events: string[] = [];
    const receipt = await context.uploader.upload(context.client, {
      filePath: context.filePath,
      contentType: "video/mp4",
      recorderName: "Ada",
      onInitiated: (value) => events.push(`initiated ${value.shareURL}`),
      onProgress: (fraction) => events.push(`progress ${fraction.toFixed(2)}`),
    });

    assert.equal(receipt.shareURL, `${SERVER}/v/abc123`);
    assert.deepEqual(events, [
      `initiated ${SERVER}/v/abc123`,
      "progress 0.00",
      "progress 0.40",
      "progress 0.80",
      "progress 1.00",
      "progress 1.00",
    ]);
    assert.deepEqual(context.server.initiateBody, {
      fileName: "recording.mp4",
      contentType: "video/mp4",
      sizeBytes: 2_500,
      title: "Screen recording",
      recorderName: "Ada",
    });
    assert.deepEqual(context.server.reassembled(), context.contents);
    assert.deepEqual(context.server.completedParts, [
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' },
    ]);
    assert.deepEqual(await readdir(context.checkpointDirectory), []);
  } finally {
    await context.cleanup();
  }
});

test("transient storage failures are retried", async () => {
  const context = await setup(1_500, 1_000);
  try {
    context.server.failPartAttempts.set(2, 2);
    await context.uploader.upload(context.client, {
      filePath: context.filePath,
      contentType: "video/mp4",
      recorderName: "Ada",
    });
    assert.equal(
      context.server.requests.filter((request) => request === "PUT /part/2").length,
      3,
    );
    assert.deepEqual(context.server.reassembled(), context.contents);
  } finally {
    await context.cleanup();
  }
});

test("client errors are not retried", async () => {
  const context = await setup(1_500, 1_000);
  try {
    context.server.initiateStatus = 401;
    await assert.rejects(
      context.uploader.upload(context.client, {
        filePath: context.filePath,
        contentType: "video/mp4",
        recorderName: "Ada",
      }),
      (error: unknown) =>
        error instanceof UploadError &&
        error.message === "Upload failed (401): Recorder token revoked.",
    );
    assert.equal(context.server.requests.length, 1);
  } finally {
    await context.cleanup();
  }
});

test("a cancelled upload resumes from its checkpoint with the same link", async () => {
  const context = await setup(3_500, 1_000);
  try {
    const controller = new AbortController();
    context.server.onPartUploaded = (partNumber) => {
      if (partNumber === 2) {
        controller.abort();
      }
    };
    await assert.rejects(
      context.uploader.upload(context.client, {
        filePath: context.filePath,
        contentType: "video/mp4",
        recorderName: "Ada",
        signal: controller.signal,
      }),
      CancellationError,
    );

    const pending = await context.uploader.pendingFiles(context.client);
    assert.deepEqual(
      pending.map((checkpoint) => checkpoint.filePath),
      [context.filePath],
    );
    assert.equal(pending[0]?.completedParts.length, 2);

    context.server.onPartUploaded = null;
    context.server.requests.length = 0;
    const receipt = await context.uploader.upload(context.client, {
      filePath: context.filePath,
      contentType: "video/mp4",
      recorderName: "Ada",
    });
    assert.equal(receipt.videoId, VIDEO_ID);
    assert.equal(context.server.requests.includes("POST /api/uploads"), false);
    assert.deepEqual(
      context.server.requests.filter((request) => request.startsWith("PUT")),
      ["PUT /part/3", "PUT /part/4"],
    );
    assert.deepEqual(context.server.reassembled(), context.contents);
  } finally {
    await context.cleanup();
  }
});

test("checkpoints are scoped to the server and workspace", async () => {
  const context = await setup(1_500, 1_000);
  try {
    const controller = new AbortController();
    context.server.onPartUploaded = () => controller.abort();
    await assert.rejects(
      context.uploader.upload(context.client, {
        filePath: context.filePath,
        contentType: "video/mp4",
        recorderName: "Ada",
        signal: controller.signal,
      }),
    );
    const otherWorkspace = new UploadAPIClient(
      { baseURL: SERVER, token: "other", workspaceID: "workspace-2" },
      context.server.fetch,
    );
    assert.deepEqual(await context.uploader.pendingFiles(otherWorkspace), []);
    assert.equal((await context.uploader.pendingFiles(context.client)).length, 1);
  } finally {
    await context.cleanup();
  }
});

test("discarding an upload aborts it on the server and removes its checkpoint", async () => {
  const context = await setup(1_500, 1_000);
  try {
    const controller = new AbortController();
    context.server.onPartUploaded = () => controller.abort();
    await assert.rejects(
      context.uploader.upload(context.client, {
        filePath: context.filePath,
        contentType: "video/mp4",
        recorderName: "Ada",
        signal: controller.signal,
      }),
    );
    await context.uploader.discard(context.client, context.filePath);
    assert.equal(context.server.requests.at(-1), `DELETE /api/uploads/${VIDEO_ID}`);
    assert.deepEqual(await context.uploader.pendingFiles(context.client), []);
  } finally {
    await context.cleanup();
  }
});
