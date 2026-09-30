export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

export const MAXIMUM_DIMENSION = 3_840;
export const FRAME_RATE = 30;

/** Normalized (0…1) frame of the webcam bubble, origin at the top-left. */
export const DEFAULT_WEBCAM_FRAME: Rect = {
  x: 0.76,
  y: 0.68,
  width: 0.2,
  height: 0.28,
};

export function fitForH264(size: Size, maximumDimension = MAXIMUM_DIMENSION) {
  const largest = Math.max(size.width, size.height, 1);
  const scale = Math.min(1, maximumDimension / largest);
  return {
    width: Math.max(2, Math.floor((size.width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((size.height * scale) / 2) * 2),
  };
}

export function videoBitrate(size: Size) {
  const pixels = size.width * size.height;
  return Math.min(14_000_000, Math.max(4_000_000, Math.round(pixels * 2.4)));
}

/**
 * Converts a region selected in display coordinates (DIP) into a crop
 * rectangle inside a captured frame of `frameSize` pixels.
 */
export function regionToFrameRect(
  region: Rect,
  displaySize: Size,
  frameSize: Size,
): Rect {
  const scaleX = frameSize.width / Math.max(displaySize.width, 1);
  const scaleY = frameSize.height / Math.max(displaySize.height, 1);
  const x = clamp(Math.round(region.x * scaleX), 0, frameSize.width - 2);
  const y = clamp(Math.round(region.y * scaleY), 0, frameSize.height - 2);
  const width = clamp(
    Math.round(region.width * scaleX),
    2,
    frameSize.width - x,
  );
  const height = clamp(
    Math.round(region.height * scaleY),
    2,
    frameSize.height - y,
  );
  return { x, y, width, height };
}

/** The circle, in canvas pixels, that the webcam bubble is drawn into. */
export function webcamCircle(frame: Rect, canvas: Size) {
  const width = frame.width * canvas.width;
  const height = frame.height * canvas.height;
  const diameter = Math.max(2, Math.min(width, height));
  const centerX = frame.x * canvas.width + width / 2;
  const centerY = frame.y * canvas.height + height / 2;
  const radius = diameter / 2;
  return {
    centerX: clamp(centerX, radius, Math.max(radius, canvas.width - radius)),
    centerY: clamp(centerY, radius, Math.max(radius, canvas.height - radius)),
    radius,
  };
}

/** Normalizes a window rectangle against the display it is shown on. */
export function normalizeFrame(bounds: Rect, display: Rect): Rect {
  return {
    x: (bounds.x - display.x) / Math.max(display.width, 1),
    y: (bounds.y - display.y) / Math.max(display.height, 1),
    width: bounds.width / Math.max(display.width, 1),
    height: bounds.height / Math.max(display.height, 1),
  };
}

export type RecordingFormat = {
  mimeType: string;
  contentType: "video/mp4" | "video/webm";
  extension: ".mp4" | ".webm";
};

const PREFERRED_FORMATS: RecordingFormat[] = [
  {
    mimeType: "video/mp4;codecs=avc1,mp4a.40.2",
    contentType: "video/mp4",
    extension: ".mp4",
  },
  {
    mimeType: "video/mp4;codecs=avc1,opus",
    contentType: "video/mp4",
    extension: ".mp4",
  },
  {
    mimeType: "video/webm;codecs=h264,opus",
    contentType: "video/webm",
    extension: ".webm",
  },
  {
    mimeType: "video/webm;codecs=vp9,opus",
    contentType: "video/webm",
    extension: ".webm",
  },
  {
    mimeType: "video/webm;codecs=vp8,opus",
    contentType: "video/webm",
    extension: ".webm",
  },
];

export function chooseRecordingFormat(
  isTypeSupported: (mimeType: string) => boolean,
): RecordingFormat | null {
  return PREFERRED_FORMATS.find((format) => isTypeSupported(format.mimeType)) ?? null;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
