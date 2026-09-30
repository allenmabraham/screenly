import {
  Menu,
  type MenuItemConstructorOptions,
  Tray,
  nativeImage,
} from "electron";

import { formatElapsed } from "../core/recording-state";
import type { AppSnapshot } from "../shared/ipc";
import { assetPath } from "./windows";

export type TrayActions = {
  openControlCenter: () => void;
  toggleControlCenter: (bounds: Electron.Rectangle) => void;
  requestRecording: () => void;
  pauseOrResume: () => void;
  stop: () => void;
  discard: () => void;
  retryUpload: () => void;
  reset: () => void;
  openShareURL: (url: string) => void;
  openLibrary: () => void;
  openSettings: () => void;
  quit: () => void;
};

export class AppTray {
  private readonly tray: Tray;
  private readonly idleIcon = trayImage("tray");
  private readonly recordingIcon = trayImage("tray-recording");
  private lastMenuKey = "";

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(this.idleIcon);
    this.tray.setToolTip("Screenly");
    this.tray.on("click", (_event, bounds) => {
      if (process.platform === "win32") {
        actions.toggleControlCenter(bounds);
      } else {
        actions.openControlCenter();
      }
    });
  }

  update(snapshot: AppSnapshot) {
    const { state } = snapshot.recorder;
    const isCapturing = state.kind === "recording" || state.kind === "paused";
    this.tray.setImage(isCapturing ? this.recordingIcon : this.idleIcon);
    this.tray.setToolTip(tooltip(snapshot));

    const items = this.menuItems(snapshot);
    const key = JSON.stringify(
      items.map((item) => [item.label, item.enabled, item.type]),
    );
    if (key !== this.lastMenuKey) {
      this.lastMenuKey = key;
      this.tray.setContextMenu(Menu.buildFromTemplate(items));
    }
  }

  destroy() {
    this.tray.destroy();
  }

  private menuItems(snapshot: AppSnapshot): MenuItemConstructorOptions[] {
    const { state } = snapshot.recorder;
    const { actions } = this;
    const items: MenuItemConstructorOptions[] = [];

    switch (state.kind) {
      case "idle":
        if (snapshot.account.isServerConfigured) {
          items.push({
            label: `New recording\t${snapshot.hotkey.label}`,
            click: actions.requestRecording,
          });
        } else {
          items.push({ label: "Sign in…", click: actions.openSettings });
        }
        break;
      case "preparing":
        items.push({ label: "Preparing capture…", enabled: false });
        break;
      case "countdown":
        items.push(
          { label: `Recording starts in ${state.count}…`, enabled: false },
          { label: "Cancel", click: actions.discard },
        );
        break;
      case "recording":
      case "paused":
        items.push(
          {
            label: state.kind === "paused" ? "Paused" : "Recording",
            enabled: false,
          },
          {
            label: state.kind === "paused" ? "Resume" : "Pause",
            click: actions.pauseOrResume,
          },
          { label: "Stop and upload", click: actions.stop },
          { label: "Discard recording", click: actions.discard },
        );
        break;
      case "finishing":
        items.push({ label: "Finalizing recording…", enabled: false });
        break;
      case "uploading":
        items.push({ label: "Uploading · link copied", enabled: false });
        break;
      case "uploaded":
        items.push(
          { label: "Link copied", enabled: false },
          { label: "Open video", click: () => actions.openShareURL(state.shareURL) },
          { label: "Done", click: actions.reset },
        );
        break;
      case "failed":
        items.push(
          { label: "Something went wrong", enabled: false },
          { label: "Retry upload", click: actions.retryUpload },
          { label: "Dismiss", click: actions.reset },
        );
        break;
    }

    items.push(
      { type: "separator" },
      { label: "Open Screenly", click: actions.openControlCenter },
      {
        label: "Open team library",
        click: actions.openLibrary,
        enabled: snapshot.account.isServerConfigured,
      },
      { label: "Settings…", click: actions.openSettings },
      { type: "separator" },
      { label: "Quit Screenly", click: actions.quit },
    );
    return items;
  }
}

function tooltip(snapshot: AppSnapshot) {
  const { state, elapsedSeconds } = snapshot.recorder;
  switch (state.kind) {
    case "recording":
      return `Screenly · Recording ${formatElapsed(elapsedSeconds)}`;
    case "paused":
      return "Screenly · Paused";
    case "uploading":
      return `Screenly · Uploading ${Math.round(state.progress * 100)}%`;
    case "failed":
      return "Screenly · Upload failed";
    default:
      return `Screenly · ${snapshot.hotkey.label} to record`;
  }
}

function trayImage(name: string) {
  const suffix = process.platform === "linux" ? "-linux" : "";
  const image = nativeImage.createFromPath(assetPath(`${name}${suffix}.png`));
  return image.isEmpty() ? nativeImage.createEmpty() : image;
}
