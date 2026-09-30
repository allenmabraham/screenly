import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  nativeImage,
  shell,
} from "electron";
import path from "node:path";

export type PageName =
  | "control"
  | "setup"
  | "settings"
  | "onboarding"
  | "hud"
  | "webcam"
  | "region"
  | "capture";

export function assetPath(fileName: string) {
  return path.join(__dirname, "assets", fileName);
}

export function appIcon() {
  return nativeImage.createFromPath(assetPath("icon.png"));
}

export function createPageWindow(
  page: PageName,
  options: BrowserWindowConstructorOptions & { query?: Record<string, string> },
) {
  const { query, webPreferences, ...windowOptions } = options;
  const window = new BrowserWindow({
    show: false,
    icon: appIcon(),
    autoHideMenuBar: true,
    backgroundColor: windowOptions.transparent ? "#00000000" : "#f5f6f8",
    ...windowOptions,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      ...webPreferences,
    },
  });
  window.removeMenu();

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalURL(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
      openExternalURL(url);
    }
  });

  void window.loadFile(path.join(__dirname, "renderer", `${page}.html`), {
    query,
  });
  return window;
}

export function openExternalURL(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      void shell.openExternal(parsed.toString());
    }
  } catch {
    // Ignore malformed URLs rather than handing them to the OS.
  }
}

export function isAppPage(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "file:" &&
      path.normalize(decodeURIComponent(parsed.pathname)).includes(
        path.normalize(path.join(__dirname, "renderer")).replace(/^[A-Za-z]:/, ""),
      )
    );
  } catch {
    return false;
  }
}
