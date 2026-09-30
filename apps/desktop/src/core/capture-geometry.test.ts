import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseRecordingFormat,
  fitForH264,
  normalizeFrame,
  regionToFrameRect,
  videoBitrate,
  webcamCircle,
} from "./capture-geometry";

test("output sizes are even and capped at 4K", () => {
  assert.deepEqual(fitForH264({ width: 1921, height: 1201 }), {
    width: 1920,
    height: 1200,
  });
  assert.deepEqual(fitForH264({ width: 5120, height: 2880 }), {
    width: 3840,
    height: 2160,
  });
  assert.deepEqual(fitForH264({ width: 1, height: 1 }), { width: 2, height: 2 });
});

test("bitrate follows the macOS recorder's 4–14 Mbps curve", () => {
  assert.equal(videoBitrate({ width: 640, height: 360 }), 4_000_000);
  assert.equal(videoBitrate({ width: 1920, height: 1080 }), 4_976_640);
  assert.equal(videoBitrate({ width: 3840, height: 2160 }), 14_000_000);
});

test("regions selected in display points map onto captured pixels", () => {
  assert.deepEqual(
    regionToFrameRect(
      { x: 100, y: 50, width: 400, height: 300 },
      { width: 1280, height: 800 },
      { width: 2560, height: 1600 },
    ),
    { x: 200, y: 100, width: 800, height: 600 },
  );
  assert.deepEqual(
    regionToFrameRect(
      { x: 1200, y: 780, width: 400, height: 300 },
      { width: 1280, height: 800 },
      { width: 1280, height: 800 },
    ),
    { x: 1200, y: 780, width: 80, height: 20 },
  );
});

test("the webcam circle stays square and inside the canvas", () => {
  assert.deepEqual(
    webcamCircle(
      { x: 0.75, y: 0.5, width: 0.125, height: 0.2 },
      { width: 1600, height: 1000 },
    ),
    { centerX: 1300, centerY: 600, radius: 100 },
  );
  const clamped = webcamCircle(
    { x: 0.95, y: 0.95, width: 0.2, height: 0.2 },
    { width: 1000, height: 1000 },
  );
  assert.deepEqual(clamped, { centerX: 900, centerY: 900, radius: 100 });
});

test("window bounds normalize against their display", () => {
  assert.deepEqual(
    normalizeFrame(
      { x: 2020, y: 100, width: 200, height: 200 },
      { x: 1920, y: 0, width: 1000, height: 1000 },
    ),
    { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  );
});

test("recording formats prefer MP4 and fall back to WebM", () => {
  assert.equal(
    chooseRecordingFormat(() => true)?.mimeType,
    "video/mp4;codecs=avc1,mp4a.40.2",
  );
  assert.deepEqual(
    chooseRecordingFormat((type) => type === "video/mp4;codecs=avc1,opus"),
    {
      mimeType: "video/mp4;codecs=avc1,opus",
      contentType: "video/mp4",
      extension: ".mp4",
    },
  );
  assert.equal(
    chooseRecordingFormat((type) => type.startsWith("video/webm;codecs=vp8"))
      ?.extension,
    ".webm",
  );
  assert.equal(chooseRecordingFormat(() => false), null);
});
