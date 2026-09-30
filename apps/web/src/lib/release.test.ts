import assert from "node:assert/strict";
import test from "node:test";

import {
  RELEASE_PLATFORMS,
  getReleaseFileName,
  getReleaseObjectKey,
  isReleasePlatform,
  resolveRelease,
} from "./release";

test("each platform downloads its latest published object", () => {
  assert.equal(getReleaseObjectKey("macos"), "releases/Screenly-latest.dmg");
  assert.equal(getReleaseObjectKey("windows"), "releases/Screenly-Setup-latest.exe");
  assert.equal(
    getReleaseObjectKey("linux-appimage"),
    "releases/Screenly-latest-x86_64.AppImage",
  );
  assert.equal(getReleaseObjectKey("linux-deb"), "releases/screenly-latest-amd64.deb");
});

test("downloads are named after their version", () => {
  assert.equal(getReleaseFileName("macos", "1.2.3"), "Screenly-1.2.3.dmg");
  assert.equal(getReleaseFileName("windows", "1.2.3"), "Screenly-Setup-1.2.3.exe");
  assert.equal(
    getReleaseFileName("linux-appimage", "1.2.3"),
    "Screenly-1.2.3-x86_64.AppImage",
  );
  assert.equal(getReleaseFileName("linux-deb", "1.2.3"), "screenly_1.2.3_amd64.deb");
});

test("platform route segments are validated", () => {
  assert.deepEqual([...RELEASE_PLATFORMS], ["macos", "windows", "linux-appimage", "linux-deb"]);
  assert.equal(isReleasePlatform("windows"), true);
  assert.equal(isReleasePlatform("linux"), false);
  assert.equal(isReleasePlatform("__proto__"), false);
});

test("published metadata overrides stale configured release details", () => {
  assert.deepEqual(
    resolveRelease("macos", {
      downloadURL: "https://screenly.example.com/api/releases/macos/download",
      configuredVersion: "0.2.1",
      configuredSHA256: "old-checksum",
      publishedMetadata: {
        version: "0.2.2",
        sha256: "new-checksum",
      },
    }),
    {
      platform: "macos",
      version: "0.2.2",
      downloadURL: "https://screenly.example.com/api/releases/macos/download",
      sha256: "new-checksum",
      minimumSystemVersion: "15.0",
      format: "dmg",
      architecture: "universal",
    },
  );
});

test("published releases download through the app without extra configuration", () => {
  assert.deepEqual(
    resolveRelease("windows", {
      publishedMetadata: { version: "0.3.0", sha256: "abc" },
      appURL: "https://screenly.example.com",
    }),
    {
      platform: "windows",
      version: "0.3.0",
      downloadURL: "https://screenly.example.com/api/releases/windows/download",
      sha256: "abc",
      minimumSystemVersion: "10",
      format: "exe",
      architecture: "x64",
    },
  );
  assert.equal(
    resolveRelease("linux-deb", { publishedMetadata: { version: "0.3.0" } })?.downloadURL,
    "/api/releases/linux-deb/download",
  );
});

test("unpublished platforms without configuration are unavailable", () => {
  assert.equal(resolveRelease("linux-appimage", {}), null);
  assert.equal(
    resolveRelease("windows", { publishedMetadata: { version: "not-a-version" } }),
    null,
  );
  assert.equal(resolveRelease("macos", { configuredVersion: "0.2.1" }), null);
});

test("configured download URLs must be absolute", () => {
  assert.throws(
    () =>
      resolveRelease("windows", {
        downloadURL: "/relative",
        configuredVersion: "0.3.0",
      }),
    /WINDOWS_APP_DOWNLOAD_URL must be a valid absolute URL/,
  );
});
