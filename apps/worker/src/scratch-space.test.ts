import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertScratchSpace,
  hasSufficientScratchSpace,
  InsufficientScratchSpaceError,
  requiredScratchBytes,
} from "./scratch-space.js";

const MEBIBYTE = 1024 * 1024;

test("small recordings need the source plus a fixed headroom", () => {
  assert.equal(requiredScratchBytes(10 * MEBIBYTE), 74 * MEBIBYTE);
  assert.equal(hasSufficientScratchSpace(74 * MEBIBYTE, 10 * MEBIBYTE), true);
  assert.equal(hasSufficientScratchSpace(73 * MEBIBYTE, 10 * MEBIBYTE), false);
});

test("large recordings need a quarter of their size as headroom", () => {
  const source = 2_000 * MEBIBYTE;
  assert.equal(requiredScratchBytes(source), 2_500 * MEBIBYTE);
  assert.equal(hasSufficientScratchSpace(2_500 * MEBIBYTE, source), true);
  assert.equal(hasSufficientScratchSpace(2_400 * MEBIBYTE, source), false);
});

test("the filesystem check passes for a tiny recording and fails for an impossible one", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "screenly-scratch-"));
  try {
    await assertScratchSpace(directory, 1024);
    await assert.rejects(
      assertScratchSpace(directory, Number.MAX_SAFE_INTEGER / 4),
      (error: unknown) => {
        assert.ok(error instanceof InsufficientScratchSpaceError);
        assert.match(error.message, /Insufficient scratch space/);
        assert.match(error.message, /PROCESSING_TEMP_DIR/);
        assert.ok(error.requiredBytes > error.availableBytes);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an unreadable directory does not block processing", async () => {
  await assertScratchSpace("/definitely/not/a/real/directory", 10 * MEBIBYTE);
});
