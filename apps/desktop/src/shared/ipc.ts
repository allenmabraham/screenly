import type { AuthWorkspace } from "../core/auth";
import type { Rect, RecordingFormat, Size } from "../core/capture-geometry";
import type { HotkeyChoice } from "../core/hotkeys";
import type { RecordingState } from "../core/recording-state";
import type { EditablePreferences } from "../core/settings";

export const CHANNELS = {
  command: "screenly:command",
  snapshot: "screenly:snapshot",
  captureCommand: "screenly:capture-command",
  captureReply: "screenly:capture-reply",
  captureChunk: "screenly:capture-chunk",
  captureEvent: "screenly:capture-event",
} as const;

export type MediaAccess =
  | "granted"
  | "denied"
  | "restricted"
  | "not-determined"
  | "unknown";

export type AppSnapshot = {
  platform: "win32" | "linux" | "darwin" | "other";
  isWayland: boolean;
  version: string;
  recorder: {
    state: RecordingState;
    elapsedSeconds: number;
  };
  preferences: EditablePreferences & { hasCompletedOnboarding: boolean };
  account: {
    isAuthenticated: boolean;
    isServerConfigured: boolean;
    hasStoredSession: boolean;
    isAuthenticating: boolean;
    authenticationError: string | null;
    username: string;
    email: string;
    workspaces: AuthWorkspace[];
    activeWorkspaceID: string | null;
    activeWorkspaceName: string | null;
    canChangeAuthentication: boolean;
  };
  hotkey: {
    label: string;
    registered: boolean;
  };
  secretStorage: "encrypted" | "weak";
  mediaAccess: {
    microphone: MediaAccess;
    camera: MediaAccess;
  };
};

export type CaptureMode = "display" | "window" | "area" | "portal";

export type CaptureSource = {
  id: string;
  kind: "screen" | "window";
  name: string;
  displayId: string | null;
  thumbnail: string;
  appIcon: string | null;
  width: number | null;
  height: number | null;
};

export type StartRecordingRequest = {
  mode: CaptureMode;
  sourceId: string | null;
};

export type AppCommand =
  | { type: "requestRecording" }
  | { type: "openSettings" }
  | { type: "openControlCenter" }
  | { type: "openLibrary" }
  | { type: "openShareURL"; url: string }
  | { type: "quit" }
  | { type: "closeWindow" }
  | { type: "pauseOrResume" }
  | { type: "stop" }
  | { type: "discard" }
  | { type: "reset" }
  | { type: "retryUpload" }
  | { type: "login"; username: string; password: string }
  | { type: "signOut" }
  | { type: "switchWorkspace"; workspaceID: string }
  | { type: "useManualConfiguration"; serverURL: string; apiToken: string }
  | { type: "getManualConfiguration" }
  | { type: "updatePreferences"; changes: Partial<EditablePreferences> }
  | { type: "completeOnboarding" }
  | { type: "listSources"; mode: CaptureMode }
  | { type: "startRecording"; request: StartRecordingRequest }
  | { type: "openPrivacySettings"; kind: "microphone" | "camera" }
  | { type: "resizeWebcam"; step: number }
  | { type: "fitContent"; height: number }
  | { type: "getRegionContext" }
  | { type: "submitRegion"; rect: Rect | null };

export type ManualConfiguration = { serverURL: string; apiToken: string };

export type RegionContext = {
  screenshot: string | null;
  size: Size;
};

export type CaptureStartConfig = {
  sourceId: string;
  requestedSize: Size;
  crop: { rect: Rect; displaySize: Size } | null;
  systemAudio: boolean;
  microphone: { deviceId: string | null } | null;
  camera: { deviceId: string | null; composite: boolean } | null;
  webcamFrame: Rect;
};

export type CapturePrepared = {
  format: RecordingFormat;
  size: Size;
};

export type CaptureCommand =
  | { type: "prepare"; config: CaptureStartConfig }
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "cancel" }
  | { type: "webcamFrame"; frame: Rect };

export type CaptureCommandEnvelope = { id: number; command: CaptureCommand };

export type CaptureReply =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; message: string };

export type CaptureEvent =
  | { type: "sourceEnded" }
  | { type: "error"; message: string };

export type ScreenlyBridge = {
  platform: AppSnapshot["platform"];
  getSnapshot(): Promise<AppSnapshot>;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void;
  command<T = unknown>(command: AppCommand): Promise<T>;
};

export type CaptureBridge = {
  onCommand(
    listener: (envelope: CaptureCommandEnvelope) => void,
  ): () => void;
  reply(reply: CaptureReply): void;
  writeChunk(chunk: ArrayBuffer): Promise<void>;
  emit(event: CaptureEvent): void;
};

export type HotkeyOption = { value: HotkeyChoice; label: string };
