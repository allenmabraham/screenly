/**
 * Shared, pure formatting helpers.
 *
 * These were previously duplicated across components with slightly different
 * behaviour. Keeping them pure makes them unit-testable and lets both server
 * and client components share one implementation.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** `5:07`, `1:04:09`. Used for durations and player timecodes. */
export function formatDuration(totalSeconds: number | null | undefined) {
  if (totalSeconds === null || totalSeconds === undefined) {
    return "";
  }

  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const seconds = safeSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

/** Spoken duration for assistive technology: "5 minutes 7 seconds". */
export function formatDurationLabel(totalSeconds: number | null | undefined) {
  if (totalSeconds === null || totalSeconds === undefined) {
    return "";
  }

  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const parts: string[] = [];

  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  }
  if (seconds > 0 || minutes === 0) {
    parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  }

  return parts.join(" ");
}

export function formatDate(value: string | Date) {
  return DATE_FORMATTER.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: string | Date) {
  return DATE_TIME_FORMATTER.format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/**
 * Compact relative time: `just now`, `4m ago`, `3h ago`, `2d ago`, then an
 * absolute date beyond 30 days so old items stay unambiguous.
 */
export function formatRelativeTime(
  value: string | Date,
  now: number = Date.now(),
) {
  const timestamp = typeof value === "string" ? Date.parse(value) : value.getTime();
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const elapsedSeconds = Math.round((now - timestamp) / 1_000);
  if (elapsedSeconds < 0) {
    return "just now";
  }
  if (elapsedSeconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  return formatDate(new Date(timestamp));
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return "";
  }

  if (bytes < 1_000) {
    return `${Math.max(0, Math.round(bytes))} B`;
  }

  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1_000;
  let unitIndex = 0;

  while (value >= 1_000 && unitIndex < units.length - 1) {
    value /= 1_000;
    unitIndex += 1;
  }

  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unitIndex]}`;
}

export function formatCount(count: number, singular: string, plural?: string) {
  const label = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count.toLocaleString("en")} ${label}`;
}

/** Up to two initials from a display name, e.g. "Ada Lovelace" -> "AL". */
export function initials(name: string) {
  const words = name
    .split(/[\s._-]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
}

/**
 * Stable hue per name so a person keeps the same avatar colour everywhere.
 * Biased toward the brand's violet/blue range.
 */
export function avatarHue(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100_000;
  }

  return 200 + (hash % 120);
}
