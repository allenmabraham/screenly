import {
  type BrowserWindow,
  type Display,
  desktopCapturer,
  screen,
} from "electron";

import { type Rect, normalizeFrame } from "../core/capture-geometry";
import type { RegionContext } from "../shared/ipc";
import { createPageWindow } from "./windows";

const HUD_SIZE = { width: 272, height: 64 };
const WEBCAM_SIZES = [140, 180, 220, 280, 340, 420];
const DEFAULT_WEBCAM_SIZE_INDEX = 2;

/** Windows that must never appear in the user's own recording. */
function protectFromCapture(window: BrowserWindow) {
  window.setContentProtection(true);
  window.setAlwaysOnTop(true, "screen-saver");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

export class RecordingHUD {
  private window: BrowserWindow | null = null;

  show(display: Display) {
    if (this.window && !this.window.isDestroyed()) {
      return;
    }
    const area = display.workArea;
    const window = createPageWindow("hud", {
      x: Math.round(area.x + (area.width - HUD_SIZE.width) / 2),
      y: area.y + 16,
      ...HUD_SIZE,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      title: "Screenly recording controls",
    });
    protectFromCapture(window);
    window.once("ready-to-show", () => window.showInactive());
    this.window = window;
  }

  hide() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }
}

export type WebcamTarget = {
  /** Screen-coordinate rectangle the recording shows, when known. */
  captureRect: Rect | null;
  display: Display;
  mirrored: boolean;
};

export class WebcamBubble {
  private window: BrowserWindow | null = null;
  private sizeIndex = DEFAULT_WEBCAM_SIZE_INDEX;
  private target: WebcamTarget | null = null;

  constructor(private readonly onFrame: (frame: Rect) => void) {}

  get isVisible() {
    return Boolean(this.window && !this.window.isDestroyed());
  }

  show(cameraDeviceId: string | null, target: WebcamTarget) {
    if (this.isVisible) {
      return;
    }
    this.target = target;
    const area = target.display.workArea;
    const anchor = target.captureRect ?? area;
    const size = Math.min(
      WEBCAM_SIZES[this.sizeIndex] ?? 220,
      Math.max(WEBCAM_SIZES[0] ?? 140, Math.floor(Math.min(anchor.width, anchor.height) * 0.4)),
    );
    this.sizeIndex = Math.max(0, WEBCAM_SIZES.findLastIndex((candidate) => candidate <= size));
    const margin = 28;
    const window = createPageWindow("webcam", {
      x: clamp(anchor.x + anchor.width - size - margin, area.x, area.x + area.width - size),
      y: clamp(anchor.y + anchor.height - size - margin, area.y, area.y + area.height - size),
      width: size,
      height: size,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      title: "Screenly camera",
      query: {
        camera: cameraDeviceId ?? "",
        mirrored: target.mirrored ? "1" : "0",
      },
    });
    protectFromCapture(window);
    window.setAspectRatio(1);
    window.on("move", () => this.syncFrame());
    window.on("resize", () => this.syncFrame());
    window.once("ready-to-show", () => {
      window.showInactive();
      this.syncFrame();
    });
    this.window = window;
  }

  resize(step: number) {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return;
    }
    const nextIndex = Math.min(
      WEBCAM_SIZES.length - 1,
      Math.max(0, this.sizeIndex + Math.sign(step)),
    );
    if (nextIndex === this.sizeIndex) {
      return;
    }
    const bounds = window.getBounds();
    const size = WEBCAM_SIZES[nextIndex] ?? bounds.width;
    this.sizeIndex = nextIndex;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    window.setBounds({
      x: Math.round(centerX - size / 2),
      y: Math.round(centerY - size / 2),
      width: size,
      height: size,
    });
  }

  hide() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.target = null;
  }

  private syncFrame() {
    const window = this.window;
    if (!window || window.isDestroyed() || !this.target) {
      return;
    }
    const bounds = window.getBounds();
    const reference =
      this.target.captureRect ?? screen.getDisplayMatching(bounds).bounds;
    this.onFrame(normalizeFrame(bounds, reference));
  }
}

export class RegionSelector {
  private window: BrowserWindow | null = null;
  private resolver: ((rect: Rect | null) => void) | null = null;
  private context: RegionContext | null = null;

  get isOpen() {
    return Boolean(this.window && !this.window.isDestroyed());
  }

  isRegionWindow(window: BrowserWindow | null) {
    return Boolean(window && window === this.window);
  }

  async select(display: Display, sourceId: string | null) {
    this.cancel();
    this.context = {
      screenshot: await screenshotOf(display, sourceId),
      size: { width: display.bounds.width, height: display.bounds.height },
    };

    const window = createPageWindow("region", {
      ...display.bounds,
      frame: false,
      resizable: false,
      movable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      fullscreen: process.platform === "linux",
      title: "Select an area to record",
      backgroundColor: "#000000",
    });
    protectFromCapture(window);
    window.once("ready-to-show", () => {
      window.setBounds(display.bounds);
      window.show();
      window.focus();
    });
    window.on("closed", () => this.finish(null));
    this.window = window;

    return new Promise<Rect | null>((resolve) => {
      this.resolver = resolve;
    });
  }

  getContext() {
    return this.context;
  }

  submit(rect: Rect | null) {
    this.finish(rect);
  }

  cancel() {
    this.finish(null);
  }

  private finish(rect: Rect | null) {
    const resolver = this.resolver;
    this.resolver = null;
    this.context = null;
    const window = this.window;
    this.window = null;
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    resolver?.(rect);
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.round(Math.min(Math.max(value, minimum), Math.max(minimum, maximum)));
}

async function screenshotOf(display: Display, sourceId: string | null) {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(display.bounds.width * display.scaleFactor),
        height: Math.round(display.bounds.height * display.scaleFactor),
      },
    });
    const source =
      sources.find((candidate) => candidate.id === sourceId) ??
      sources.find((candidate) => candidate.display_id === String(display.id)) ??
      (sources.length === 1 ? sources[0] : undefined);
    if (!source || source.thumbnail.isEmpty()) {
      return null;
    }
    return `data:image/jpeg;base64,${source.thumbnail.toJPEG(82).toString("base64")}`;
  } catch {
    return null;
  }
}
