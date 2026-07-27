import assert from "node:assert/strict";
import test from "node:test";

import {
  avatarHue,
  formatBytes,
  formatCount,
  formatDate,
  formatDuration,
  formatDurationLabel,
  formatRelativeTime,
  initials,
} from "./format";

test("formatDuration pads seconds and adds hours only when needed", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(7), "0:07");
  assert.equal(formatDuration(62), "1:02");
  assert.equal(formatDuration(600), "10:00");
  assert.equal(formatDuration(3_599), "59:59");
  assert.equal(formatDuration(3_600), "1:00:00");
  assert.equal(formatDuration(3_671), "1:01:11");
});

test("formatDuration is defensive about missing and negative input", () => {
  assert.equal(formatDuration(null), "");
  assert.equal(formatDuration(undefined), "");
  assert.equal(formatDuration(-5), "0:00");
  assert.equal(formatDuration(12.7), "0:12");
});

test("formatDurationLabel produces a spoken duration", () => {
  assert.equal(formatDurationLabel(0), "0 seconds");
  assert.equal(formatDurationLabel(1), "1 second");
  assert.equal(formatDurationLabel(60), "1 minute");
  assert.equal(formatDurationLabel(61), "1 minute 1 second");
  assert.equal(formatDurationLabel(150), "2 minutes 30 seconds");
  assert.equal(formatDurationLabel(null), "");
});

test("formatRelativeTime steps through minutes, hours and days", () => {
  const now = Date.parse("2026-07-26T12:00:00.000Z");
  const at = (offsetSeconds: number) =>
    new Date(now - offsetSeconds * 1_000).toISOString();

  assert.equal(formatRelativeTime(at(0), now), "just now");
  assert.equal(formatRelativeTime(at(59), now), "just now");
  assert.equal(formatRelativeTime(at(60), now), "1m ago");
  assert.equal(formatRelativeTime(at(59 * 60), now), "59m ago");
  assert.equal(formatRelativeTime(at(60 * 60), now), "1h ago");
  assert.equal(formatRelativeTime(at(23 * 3_600), now), "23h ago");
  assert.equal(formatRelativeTime(at(24 * 3_600), now), "1d ago");
  assert.equal(formatRelativeTime(at(29 * 86_400), now), "29d ago");
});

test("formatRelativeTime falls back to an absolute date past 30 days", () => {
  const now = Date.parse("2026-07-26T12:00:00.000Z");
  const old = new Date(now - 200 * 86_400_000).toISOString();
  assert.equal(formatRelativeTime(old, now), formatDate(old));
});

test("formatRelativeTime tolerates clock skew and invalid input", () => {
  const now = Date.parse("2026-07-26T12:00:00.000Z");
  assert.equal(formatRelativeTime(new Date(now + 5_000).toISOString(), now), "just now");
  assert.equal(formatRelativeTime("not-a-date", now), "");
});

test("formatBytes switches units with one decimal below ten", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(999), "999 B");
  assert.equal(formatBytes(1_000), "1 kB");
  assert.equal(formatBytes(1_500), "1.5 kB");
  assert.equal(formatBytes(12_400), "12 kB");
  assert.equal(formatBytes(5_400_000), "5.4 MB");
  assert.equal(formatBytes(2_300_000_000), "2.3 GB");
  assert.equal(formatBytes(null), "");
});

test("formatCount pluralises and localises", () => {
  assert.equal(formatCount(1, "view"), "1 view");
  assert.equal(formatCount(2, "view"), "2 views");
  assert.equal(formatCount(1_500, "view"), "1,500 views");
  assert.equal(formatCount(2, "person", "people"), "2 people");
});

test("initials handles one word, several words and separators", () => {
  assert.equal(initials("admin"), "AD");
  assert.equal(initials("Ada Lovelace"), "AL");
  assert.equal(initials("ada.lovelace"), "AL");
  assert.equal(initials("Grace B Hopper"), "GH");
  assert.equal(initials("   "), "?");
});

test("avatarHue is stable and inside the brand range", () => {
  assert.equal(avatarHue("riley"), avatarHue("riley"));
  assert.notEqual(avatarHue("riley"), avatarHue("jordan"));
  for (const name of ["a", "riley", "jordan", "admin", "Ada Lovelace"]) {
    const hue = avatarHue(name);
    assert.ok(hue >= 200 && hue < 320, `${name} -> ${hue}`);
  }
});
