import { statfs } from "node:fs/promises";

const MINIMUM_HEADROOM_BYTES = 64 * 1024 * 1024;

export class InsufficientScratchSpaceError extends Error {
  constructor(
    readonly requiredBytes: number,
    readonly availableBytes: number,
    directory: string,
  ) {
    super(
      `Insufficient scratch space in ${directory}: the recording needs at least ` +
        `${formatBytes(requiredBytes)} but only ${formatBytes(availableBytes)} is free. ` +
        "Raise the processor's memory or disk limit, or point PROCESSING_TEMP_DIR at a mounted volume.",
    );
    this.name = "InsufficientScratchSpaceError";
  }
}

/**
 * Lower bound on the scratch space one recording needs: the source download
 * plus headroom for the thumbnail, preview and progress files. Transcoding
 * and HLS packaging can need more, but a recording that fails this check can
 * never be processed, so it is better to fail with a clear message than to be
 * killed by the platform for exceeding memory (Cloud Run's /tmp is RAM).
 */
export function requiredScratchBytes(sourceSizeBytes: number) {
  return Math.ceil(
    sourceSizeBytes + Math.max(MINIMUM_HEADROOM_BYTES, sourceSizeBytes * 0.25),
  );
}

export function hasSufficientScratchSpace(
  availableBytes: number,
  sourceSizeBytes: number,
) {
  return availableBytes >= requiredScratchBytes(sourceSizeBytes);
}

export async function assertScratchSpace(
  directory: string,
  sourceSizeBytes: number,
) {
  let availableBytes: number;
  try {
    const stats = await statfs(directory);
    availableBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    // Unknown filesystems (or platforms without statfs) fall through to the
    // existing behaviour rather than blocking processing on a probe failure.
    return;
  }

  if (!Number.isFinite(availableBytes) || availableBytes <= 0) {
    return;
  }

  if (!hasSufficientScratchSpace(availableBytes, sourceSizeBytes)) {
    throw new InsufficientScratchSpaceError(
      requiredScratchBytes(sourceSizeBytes),
      availableBytes,
      directory,
    );
  }
}

function formatBytes(bytes: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
