import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  type Display,
  globalShortcut,
  ipcMain,
  type IpcMainInvokeEvent,
  net,
  screen,
  session,
  shell,
  systemPreferences,
} from "electron";
import { hostname, userInfo } from "node:os";

import { AccountController } from "../core/account";
import { AuthService } from "../core/auth";
import {
  DEFAULT_WEBCAM_FRAME,
  type Rect,
  fitForH264,
} from "../core/capture-geometry";
import { UploadCheckpointStore } from "../core/checkpoint-store";
import { CancellationError, type FetchLike, sleep } from "../core/http";
import { hotkeyAccelerator, hotkeyLabel } from "../core/hotkeys";
import { MultipartUploader } from "../core/multipart-uploader";
import {
  canChangeAuthentication,
  isActiveState,
  isCapturingState,
} from "../core/recording-state";
import { isAllowedServerURL, joinServerPath } from "../core/server-url";
import { RecorderSettings } from "../core/settings";
import {
  type AppCommand,
  type AppSnapshot,
  type CaptureSource,
  type CaptureStartConfig,
  CHANNELS,
  type MediaAccess,
  type StartRecordingRequest,
} from "../shared/ipc";
import { RecordingHUD, RegionSelector, WebcamBubble } from "./overlays";
import { RecordingController } from "./recording-controller";
import {
  JSONPreferencesFile,
  SafeStorageVault,
  recordingsDirectory,
  uploadsDirectory,
} from "./storage";
import { AppTray } from "./tray";
import { createPageWindow, isAppPage, openExternalURL } from "./windows";

type ActiveTarget = {
  display: Display;
  captureRect: Rect | null;
  compositesWebcam: boolean;
};

const CAPTURE_LIMIT = { width: 3_840, height: 3_840 };

export class ScreenlyApp {
  private readonly vault = new SafeStorageVault();
  private readonly settings: RecorderSettings;
  private readonly account: AccountController;
  private readonly recorder: RecordingController;
  private readonly hud = new RecordingHUD();
  private readonly webcam: WebcamBubble;
  private readonly region = new RegionSelector();
  private readonly fetchImpl: FetchLike = (input, init) => net.fetch(input, init);
  private tray: AppTray | null = null;
  private controlWindow: BrowserWindow | null = null;
  private setupWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private onboardingWindow: BrowserWindow | null = null;
  private activeTarget: ActiveTarget | null = null;
  private hotkeyRegistered = false;
  private registeredAccelerator: string | null = null;
  private broadcastScheduled = false;
  private quitting = false;

  constructor(readonly isWayland: boolean) {
    this.settings = new RecorderSettings(new JSONPreferencesFile(), this.vault, {
      recorderName: defaultRecorderName(),
    });
    this.account = new AccountController({
      settings: this.settings,
      createAuthService: (baseURL) => new AuthService(baseURL, this.fetchImpl),
      deviceName: deviceName(),
      canChangeAuthentication: () => canChangeAuthentication(this.recorder.state),
    });
    this.recorder = new RecordingController(
      this.settings,
      new MultipartUploader(new UploadCheckpointStore(uploadsDirectory()), this.fetchImpl),
      this.fetchImpl,
      recordingsDirectory(),
      {
        onShareLink: (receipt, opensSharePage) => {
          clipboard.writeText(receipt.shareURL);
          if (opensSharePage) {
            openExternalURL(receipt.shareURL);
          }
        },
        checkMediaAccess: (requires) => this.mediaAccessProblem(requires),
      },
    );
    this.webcam = new WebcamBubble((frame) => this.recorder.updateWebcamFrame(frame));
  }

  async start() {
    this.configureSessionPermissions();
    ipcMain.handle(CHANNELS.snapshot, () => this.snapshot());
    ipcMain.handle(CHANNELS.command, (event, command: AppCommand) =>
      this.handleCommand(event, command),
    );

    this.tray = new AppTray({
      openControlCenter: () => this.showControlCenter(),
      toggleControlCenter: (bounds) => this.toggleControlCenter(bounds),
      requestRecording: () => this.requestRecording(),
      pauseOrResume: () => this.recorder.pauseOrResume(),
      stop: () => this.recorder.stop(),
      discard: () => this.recorder.discard(),
      retryUpload: () => this.recorder.retryUpload(),
      reset: () => this.recorder.reset(),
      openShareURL: (url) => openExternalURL(url),
      openLibrary: () => this.openLibrary(),
      openSettings: () => this.showSettings(),
      quit: () => app.quit(),
    });

    this.settings.onChange(() => {
      this.syncHotkey();
      this.scheduleBroadcast();
    });
    this.account.onChange(() => this.scheduleBroadcast());
    this.recorder.onChange(() => {
      this.synchronizeOverlays();
      this.scheduleBroadcast();
    });
    this.syncHotkey();
    this.scheduleBroadcast();

    if (!this.settings.hasCompletedOnboarding) {
      this.showOnboarding();
    } else if (!process.argv.includes("--hidden")) {
      this.showControlCenter();
    }

    await this.account.validateStoredSession();
    if (this.settings.hasCompletedOnboarding) {
      await this.recorder.resumePendingUploads();
    }
  }

  handleSecondInstance() {
    if (!this.settings.hasCompletedOnboarding) {
      this.showOnboarding();
    } else {
      this.showControlCenter();
    }
  }

  shutdown() {
    if (this.quitting) {
      return;
    }
    this.quitting = true;
    globalShortcut.unregisterAll();
    this.recorder.shutdown();
    this.tray?.destroy();
    this.tray = null;
  }

  // MARK: Commands

  private async handleCommand(event: IpcMainInvokeEvent, command: AppCommand) {
    if (!isAppPage(event.sender.getURL())) {
      throw new Error("Commands are only accepted from Screenly windows.");
    }
    const sender = BrowserWindow.fromWebContents(event.sender);

    switch (command.type) {
      case "requestRecording":
        return this.requestRecording();
      case "openSettings":
        return this.showSettings();
      case "openControlCenter":
        return this.showControlCenter();
      case "openLibrary":
        return this.openLibrary();
      case "openShareURL":
        return openExternalURL(command.url);
      case "quit":
        return app.quit();
      case "closeWindow":
        return sender?.close();
      case "pauseOrResume":
        return this.recorder.pauseOrResume();
      case "stop":
        return this.recorder.stop();
      case "discard":
        return this.recorder.discard();
      case "reset":
        return this.recorder.reset();
      case "retryUpload":
        return this.recorder.retryUpload();
      case "login":
        return this.account.login(String(command.username), String(command.password));
      case "signOut":
        return this.account.signOut();
      case "switchWorkspace":
        return this.account.switchWorkspace(String(command.workspaceID));
      case "useManualConfiguration":
        return this.account.useManualConfiguration(
          String(command.serverURL),
          String(command.apiToken),
        );
      case "getManualConfiguration":
        return {
          serverURL: this.settings.serverURL,
          apiToken: this.settings.hasStoredSession ? "" : this.settings.apiToken,
        };
      case "updatePreferences":
        return this.settings.update(command.changes ?? {});
      case "completeOnboarding":
        return this.completeOnboarding();
      case "listSources":
        return this.listSources(command.mode);
      case "startRecording":
        return this.startRecording(command.request);
      case "openPrivacySettings":
        return this.openPrivacySettings(command.kind);
      case "resizeWebcam":
        return this.webcam.resize(Number(command.step));
      case "fitContent":
        return this.fitControlCenter(sender, Number(command.height));
      case "getRegionContext":
        return this.region.isRegionWindow(sender) ? this.region.getContext() : null;
      case "submitRegion":
        if (this.region.isRegionWindow(sender)) {
          this.region.submit(command.rect);
        }
        return;
    }
  }

  private requestRecording() {
    if (isActiveState(this.recorder.state)) {
      return;
    }
    if (!this.settings.isServerConfigured) {
      this.account.setError("Sign in before starting a recording.");
      this.showOnboarding();
      return;
    }
    this.showSetup();
  }

  private completeOnboarding() {
    if (!this.settings.isServerConfigured) {
      this.account.setError("Sign in or configure a server before finishing setup.");
      return;
    }
    this.settings.markOnboardingComplete();
    this.onboardingWindow?.close();
    this.requestRecording();
    void this.recorder.resumePendingUploads();
  }

  private openLibrary() {
    if (isAllowedServerURL(this.settings.serverURL)) {
      openExternalURL(joinServerPath(this.settings.serverURL, "library"));
    }
  }

  private openPrivacySettings(kind: "microphone" | "camera") {
    if (process.platform === "win32") {
      void shell.openExternal(
        kind === "microphone" ? "ms-settings:privacy-microphone" : "ms-settings:privacy-webcam",
      );
    }
  }

  // MARK: Capture sources and recording

  private async listSources(mode: StartRecordingRequest["mode"]): Promise<CaptureSource[]> {
    if (this.isWayland || mode === "portal") {
      return [];
    }
    const types: ("screen" | "window")[] = mode === "window" ? ["window"] : ["screen"];
    const ownWindows = new Set(
      BrowserWindow.getAllWindows().map((window) => window.getMediaSourceId()),
    );
    const sources = await desktopCapturer.getSources({
      types,
      thumbnailSize: { width: 400, height: 250 },
      fetchWindowIcons: mode === "window",
    });
    const displays = screen.getAllDisplays();

    return sources
      .filter((source) => !ownWindows.has(source.id))
      .filter((source) => mode !== "window" || !source.thumbnail.isEmpty())
      .map((source, index) => {
        const display = source.id.startsWith("screen:")
          ? displayForSource(source.display_id, index, displays)
          : null;
        const physical = display
          ? {
              width: Math.round(display.bounds.width * display.scaleFactor),
              height: Math.round(display.bounds.height * display.scaleFactor),
            }
          : null;
        const size = source.thumbnail.getSize();
        return {
          id: source.id,
          kind: source.id.startsWith("screen:") ? "screen" : "window",
          name:
            display && displays.length > 1
              ? `${source.name} · ${display.label || `Display ${index + 1}`}`
              : source.name,
          displayId: display ? String(display.id) : null,
          thumbnail: source.thumbnail.isEmpty() ? "" : source.thumbnail.toDataURL(),
          appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
          width: physical?.width ?? (size.width || null),
          height: physical?.height ?? (size.height || null),
        } satisfies CaptureSource;
      });
  }

  private async startRecording(request: StartRecordingRequest) {
    const { settings } = this;
    const requires = {
      microphone: settings.capturesMicrophone,
      camera: settings.showsWebcam,
    };
    const baseConfig = (
      sourceId: string,
      requestedSize: { width: number; height: number },
    ): CaptureStartConfig => ({
      sourceId,
      requestedSize,
      crop: null,
      systemAudio: settings.capturesSystemAudio,
      microphone: settings.capturesMicrophone
        ? { deviceId: settings.microphoneDeviceID }
        : null,
      camera: settings.showsWebcam
        ? { deviceId: settings.cameraDeviceID, composite: false }
        : null,
      webcamFrame: DEFAULT_WEBCAM_FRAME,
    });

    if (request.mode === "portal" || this.isWayland) {
      this.recorder.start({
        requires,
        prepareConfig: async () => {
          const [source] = await desktopCapturer.getSources({
            types: ["screen", "window"],
            thumbnailSize: { width: 0, height: 0 },
          });
          if (!source) {
            throw new CancellationError();
          }
          const display = screen.getPrimaryDisplay();
          const config = baseConfig(source.id, CAPTURE_LIMIT);
          return this.withWebcamTarget(config, {
            display,
            captureRect: source.id.startsWith("screen:") ? display.bounds : null,
            compositesWebcam: source.id.startsWith("window:"),
          });
        },
      });
      return;
    }

    if (!request.sourceId) {
      return;
    }
    const sourceId = request.sourceId;

    if (request.mode === "window") {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      this.recorder.start({
        requires,
        prepareConfig: async () =>
          this.withWebcamTarget(baseConfig(sourceId, CAPTURE_LIMIT), {
            display,
            captureRect: null,
            compositesWebcam: true,
          }),
      });
      return;
    }

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 0, height: 0 },
    });
    const displays = screen.getAllDisplays();
    const index = sources.findIndex((source) => source.id === sourceId);
    const display =
      displayForSource(sources[index]?.display_id ?? "", Math.max(index, 0), displays) ??
      screen.getPrimaryDisplay();
    const physical = fitForH264({
      width: Math.round(display.bounds.width * display.scaleFactor),
      height: Math.round(display.bounds.height * display.scaleFactor),
    });

    if (request.mode === "display") {
      this.recorder.start({
        requires,
        prepareConfig: async () =>
          this.withWebcamTarget(baseConfig(sourceId, physical), {
            display,
            captureRect: display.bounds,
            compositesWebcam: process.platform === "win32",
          }),
      });
      return;
    }

    this.setupWindow?.close();
    await sleep(200);
    const region = await this.region.select(display, sourceId);
    if (!region || region.width < 8 || region.height < 8) {
      return;
    }
    this.recorder.start({
      requires,
      prepareConfig: async () => {
        const config = baseConfig(sourceId, physical);
        config.crop = {
          rect: region,
          displaySize: { width: display.bounds.width, height: display.bounds.height },
        };
        return this.withWebcamTarget(config, {
          display,
          captureRect: {
            x: display.bounds.x + region.x,
            y: display.bounds.y + region.y,
            width: region.width,
            height: region.height,
          },
          compositesWebcam: process.platform === "win32",
        });
      },
    });
  }

  private withWebcamTarget(config: CaptureStartConfig, target: ActiveTarget) {
    this.activeTarget = target;
    if (config.camera) {
      config.camera = { ...config.camera, composite: target.compositesWebcam };
    }
    return config;
  }

  private synchronizeOverlays() {
    const { state } = this.recorder;
    const display = this.activeTarget?.display ?? screen.getPrimaryDisplay();

    if (state.kind === "countdown") {
      this.setupWindow?.close();
      this.controlWindow?.hide();
    }
    if (state.kind === "countdown" || isCapturingState(state)) {
      this.hud.show(display);
    } else {
      this.hud.hide();
    }

    if (isCapturingState(state) && this.settings.showsWebcam && this.activeTarget) {
      this.webcam.show(this.settings.cameraDeviceID, {
        display,
        captureRect: this.activeTarget.captureRect,
        mirrored: this.activeTarget.compositesWebcam,
      });
    } else if (!isCapturingState(state)) {
      this.webcam.hide();
    }

    if (state.kind === "idle" || state.kind === "uploaded" || state.kind === "failed") {
      this.activeTarget = null;
    }
  }

  private mediaAccessProblem(requires: { microphone: boolean; camera: boolean }) {
    if (requires.microphone && this.mediaAccess("microphone") === "denied") {
      return "Microphone access is turned off for desktop apps. Allow it in Windows Settings > Privacy & security > Microphone, or turn off the microphone.";
    }
    if (requires.camera && this.mediaAccess("camera") === "denied") {
      return "Camera access is turned off for desktop apps. Allow it in Windows Settings > Privacy & security > Camera, or turn off the webcam.";
    }
    return null;
  }

  private mediaAccess(kind: "microphone" | "camera"): MediaAccess {
    if (process.platform !== "win32") {
      return "unknown";
    }
    try {
      return systemPreferences.getMediaAccessStatus(kind) as MediaAccess;
    } catch {
      return "unknown";
    }
  }

  // MARK: Hotkey

  private syncHotkey() {
    const accelerator = hotkeyAccelerator(this.settings.hotkey);
    if (accelerator === this.registeredAccelerator) {
      return;
    }
    if (this.registeredAccelerator) {
      globalShortcut.unregister(this.registeredAccelerator);
    }
    this.registeredAccelerator = accelerator;
    try {
      this.hotkeyRegistered = globalShortcut.register(accelerator, () =>
        this.requestRecording(),
      );
    } catch {
      this.hotkeyRegistered = false;
    }
  }

  // MARK: Windows

  private showControlCenter(trayBounds?: Electron.Rectangle) {
    const window = this.ensureControlWindow();
    if (process.platform === "win32") {
      positionNearTray(window, trayBounds);
    }
    window.show();
    window.focus();
  }

  private toggleControlCenter(bounds: Electron.Rectangle) {
    if (this.controlWindow?.isVisible()) {
      this.controlWindow.hide();
    } else {
      this.showControlCenter(bounds);
    }
  }

  private ensureControlWindow() {
    if (this.controlWindow && !this.controlWindow.isDestroyed()) {
      return this.controlWindow;
    }
    const popover = process.platform === "win32";
    const window = createPageWindow("control", {
      width: 360,
      height: 300,
      useContentSize: true,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      title: "Screenly",
      frame: !popover,
      skipTaskbar: popover,
      alwaysOnTop: popover,
    });
    window.once("ready-to-show", () => window.show());
    if (popover) {
      window.on("blur", () => {
        if (!window.webContents.isDevToolsOpened()) {
          window.hide();
        }
      });
    }
    window.on("close", (event) => {
      if (!this.quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    this.controlWindow = window;
    return window;
  }

  private fitControlCenter(sender: BrowserWindow | null, height: number) {
    const window = this.controlWindow;
    if (!window || window.isDestroyed() || sender !== window || !Number.isFinite(height)) {
      return;
    }
    const [width] = window.getContentSize();
    const clamped = Math.round(Math.min(640, Math.max(160, height)));
    window.setContentSize(width ?? 360, clamped);
  }

  private showSetup() {
    this.controlWindow?.hide();
    if (this.setupWindow && !this.setupWindow.isDestroyed()) {
      this.setupWindow.show();
      this.setupWindow.focus();
      return;
    }
    const window = createPageWindow("setup", {
      width: 720,
      height: 640,
      minWidth: 640,
      minHeight: 560,
      title: "New recording",
      maximizable: false,
      fullscreenable: false,
    });
    window.once("ready-to-show", () => {
      window.show();
      window.focus();
    });
    window.on("closed", () => {
      this.setupWindow = null;
    });
    this.setupWindow = window;
  }

  private showSettings() {
    this.controlWindow?.hide();
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.show();
      this.settingsWindow.focus();
      return;
    }
    const window = createPageWindow("settings", {
      width: 620,
      height: 720,
      minWidth: 520,
      minHeight: 480,
      title: "Screenly Settings",
      maximizable: false,
      fullscreenable: false,
    });
    window.once("ready-to-show", () => window.show());
    window.on("closed", () => {
      this.settingsWindow = null;
    });
    this.settingsWindow = window;
  }

  private showOnboarding() {
    if (this.onboardingWindow && !this.onboardingWindow.isDestroyed()) {
      this.onboardingWindow.show();
      this.onboardingWindow.focus();
      return;
    }
    const window = createPageWindow("onboarding", {
      width: 620,
      height: 740,
      minWidth: 560,
      minHeight: 560,
      title: "Welcome to Screenly",
      maximizable: false,
      fullscreenable: false,
    });
    window.once("ready-to-show", () => window.show());
    window.on("closed", () => {
      this.onboardingWindow = null;
    });
    this.onboardingWindow = window;
  }

  // MARK: Snapshot

  private snapshot(): AppSnapshot {
    const { settings, account, recorder } = this;
    return {
      platform:
        process.platform === "win32" || process.platform === "linux" || process.platform === "darwin"
          ? process.platform
          : "other",
      isWayland: this.isWayland,
      version: app.getVersion(),
      recorder: { state: recorder.state, elapsedSeconds: recorder.elapsedSeconds },
      preferences: {
        serverURL: settings.serverURL,
        recorderName: settings.recorderName,
        capturesSystemAudio: settings.capturesSystemAudio,
        capturesMicrophone: settings.capturesMicrophone,
        showsWebcam: settings.showsWebcam,
        microphoneDeviceID: settings.microphoneDeviceID,
        cameraDeviceID: settings.cameraDeviceID,
        hotkey: settings.hotkey,
        hasCompletedOnboarding: settings.hasCompletedOnboarding,
      },
      account: {
        isAuthenticated: settings.isAuthenticated,
        isServerConfigured: settings.isServerConfigured,
        hasStoredSession: settings.hasStoredSession,
        isAuthenticating: account.isAuthenticating,
        authenticationError: account.authenticationError,
        username: settings.username,
        email: settings.email,
        workspaces: settings.availableWorkspaces,
        activeWorkspaceID: settings.activeWorkspaceID,
        activeWorkspaceName: settings.activeWorkspaceName,
        canChangeAuthentication: canChangeAuthentication(recorder.state),
      },
      hotkey: {
        label: hotkeyLabel(settings.hotkey),
        registered: this.hotkeyRegistered,
      },
      secretStorage: this.vault.isEncrypted ? "encrypted" : "weak",
      mediaAccess: {
        microphone: this.mediaAccess("microphone"),
        camera: this.mediaAccess("camera"),
      },
    };
  }

  private scheduleBroadcast() {
    if (this.broadcastScheduled) {
      return;
    }
    this.broadcastScheduled = true;
    setImmediate(() => {
      this.broadcastScheduled = false;
      const snapshot = this.snapshot();
      this.tray?.update(snapshot);
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && isAppPage(window.webContents.getURL())) {
          window.webContents.send(CHANNELS.snapshot, snapshot);
        }
      }
    });
  }

  private configureSessionPermissions() {
    const allowed = new Set(["media", "clipboard-sanitized-write"]);
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        callback(allowed.has(permission) && isAppPage(webContents.getURL()));
      },
    );
    session.defaultSession.setPermissionCheckHandler((webContents, permission) =>
      Boolean(webContents && allowed.has(permission) && isAppPage(webContents.getURL())),
    );
  }
}

function displayForSource(displayID: string, index: number, displays: Display[]) {
  return (
    displays.find((display) => String(display.id) === displayID) ??
    (displays.length === 1 ? displays[0] : displays[index]) ??
    null
  );
}

function positionNearTray(window: BrowserWindow, trayBounds?: Electron.Rectangle) {
  const [width = 360, height = 300] = window.getSize();
  const anchor = trayBounds ?? {
    ...screen.getCursorScreenPoint(),
    width: 0,
    height: 0,
  };
  const display = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y });
  const area = display.workArea;
  const taskbarAtTop = area.y > display.bounds.y;
  const x = Math.round(
    Math.min(
      Math.max(anchor.x + anchor.width / 2 - width / 2, area.x + 8),
      area.x + area.width - width - 8,
    ),
  );
  const y = taskbarAtTop ? area.y + 8 : area.y + area.height - height - 8;
  window.setPosition(x, y, false);
}

function deviceName() {
  const platformName = process.platform === "win32" ? "Windows" : "Linux";
  const name = hostname().trim() || `${platformName} recorder`;
  return name.slice(0, 120);
}

function defaultRecorderName() {
  try {
    return userInfo().username || "Screenly recorder";
  } catch {
    return "Screenly recorder";
  }
}
