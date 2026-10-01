import assert from "node:assert/strict";
import test from "node:test";

import { detectDesktopPlatform } from "./platform";

test("desktop browsers map to their recorder platform", () => {
  assert.equal(
    detectDesktopPlatform(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
    ),
    "windows",
  );
  assert.equal(
    detectDesktopPlatform(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    ),
    "macos",
  );
  assert.equal(
    detectDesktopPlatform("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"),
    "linux",
  );
  assert.equal(
    detectDesktopPlatform("Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 Chrome/140.0"),
    "linux",
  );
});

test("mobile, ChromeOS and unknown agents have no recorder platform", () => {
  assert.equal(
    detectDesktopPlatform(
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
    ),
    null,
  );
  assert.equal(
    detectDesktopPlatform(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    ),
    null,
  );
  assert.equal(
    detectDesktopPlatform("Mozilla/5.0 (X11; CrOS x86_64 16002.0.0) AppleWebKit/537.36 Chrome/140.0"),
    null,
  );
  assert.equal(detectDesktopPlatform(""), null);
  assert.equal(detectDesktopPlatform(null), null);
});
