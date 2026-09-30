import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedServerURL, joinServerPath } from "./server-url";

test("only HTTPS or loopback HTTP servers are allowed", () => {
  assert.equal(isAllowedServerURL("https://video.example.com"), true);
  assert.equal(isAllowedServerURL(" https://video.example.com "), true);
  assert.equal(isAllowedServerURL("http://localhost:3000"), true);
  assert.equal(isAllowedServerURL("http://127.0.0.1:3000"), true);
  assert.equal(isAllowedServerURL("http://[::1]:3000"), true);
  assert.equal(isAllowedServerURL("http://video.example.com"), false);
  assert.equal(isAllowedServerURL("ftp://video.example.com"), false);
  assert.equal(isAllowedServerURL("video.example.com"), false);
  assert.equal(isAllowedServerURL(""), false);
});

test("server paths are appended like URL.appending(path:)", () => {
  assert.equal(
    joinServerPath("https://video.example.com", "api/uploads"),
    "https://video.example.com/api/uploads",
  );
  assert.equal(
    joinServerPath("https://video.example.com/", "/api/uploads"),
    "https://video.example.com/api/uploads",
  );
  assert.equal(
    joinServerPath("https://example.com/screenly/?q=1#x", "library"),
    "https://example.com/screenly/library",
  );
});
