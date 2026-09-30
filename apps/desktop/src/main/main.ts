import { app } from "electron";

import { ScreenlyApp } from "./app";

const isWayland =
  process.platform === "linux" &&
  (process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY));

app.setName("Screenly");
if (process.platform === "win32") {
  app.setAppUserModelId("com.screenly.recorder");
}
if (isWayland) {
  // Screen capture and global shortcuts go through the XDG desktop portal.
  app.commandLine.appendSwitch(
    "enable-features",
    "WebRTCPipeWireCapturer,GlobalShortcutsPortal",
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let screenly: ScreenlyApp | null = null;

  app.on("second-instance", () => {
    screenly?.handleSecondInstance();
  });

  // The recorder lives in the tray; closing its windows must not quit it.
  app.on("window-all-closed", () => undefined);

  // Deferring quit here stops SIGTERM-initiated quits from completing, so
  // shutdown is synchronous and Electron tears down the windows itself.
  app.on("before-quit", () => {
    screenly?.shutdown();
  });

  void app.whenReady().then(async () => {
    screenly = new ScreenlyApp(isWayland);
    await screenly.start();
  });
}
