import type {
  AuthUser,
  AuthWorkspace,
  DeviceLoginResponse,
  DeviceSessionResponse,
  WorkspaceSwitchResponse,
} from "./auth";
import { DEFAULT_HOTKEY, type HotkeyChoice, isHotkeyChoice } from "./hotkeys";
import { isAllowedServerURL } from "./server-url";

export const PRODUCTION_SERVER_URL =
  "https://screenly-web-271658039719.us-central1.run.app";

export interface SecretVault {
  /** Returns an empty string when the secret is absent or unreadable. */
  get(account: string): string;
  set(account: string, value: string): void;
  remove(account: string): void;
}

export interface PreferencesFile {
  read(): Record<string, unknown>;
  write(values: Record<string, unknown>): void;
}

export type EditablePreferences = {
  serverURL: string;
  recorderName: string;
  capturesSystemAudio: boolean;
  capturesMicrophone: boolean;
  showsWebcam: boolean;
  microphoneDeviceID: string | null;
  cameraDeviceID: string | null;
  hotkey: HotkeyChoice;
};

type Preferences = EditablePreferences & {
  hasCompletedOnboarding: boolean;
  username: string;
  email: string;
  workspaces: AuthWorkspace[];
  activeWorkspaceID: string | null;
  activeWorkspaceName: string | null;
  sessionExpiresAt: string | null;
};

const SECRET = {
  apiToken: "apiToken",
  sessionToken: "userSessionToken",
} as const;

export function recorderTokenAccount(workspaceID: string) {
  return `recorderToken.${workspaceID}`;
}

export class RecorderSettings {
  private preferences: Preferences;
  private apiTokenValue: string;
  private sessionTokenValue: string;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly file: PreferencesFile,
    private readonly vault: SecretVault,
    defaults: { recorderName: string },
  ) {
    this.preferences = readPreferences(file.read(), defaults.recorderName);
    this.sessionTokenValue = vault.get(SECRET.sessionToken);
    const workspaceID = this.preferences.activeWorkspaceID;
    this.apiTokenValue =
      this.sessionTokenValue && workspaceID
        ? vault.get(recorderTokenAccount(workspaceID))
        : vault.get(SECRET.apiToken);
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get serverURL() {
    return this.preferences.serverURL;
  }
  get recorderName() {
    return this.preferences.recorderName;
  }
  get capturesSystemAudio() {
    return this.preferences.capturesSystemAudio;
  }
  get capturesMicrophone() {
    return this.preferences.capturesMicrophone;
  }
  get showsWebcam() {
    return this.preferences.showsWebcam;
  }
  get microphoneDeviceID() {
    return this.preferences.microphoneDeviceID;
  }
  get cameraDeviceID() {
    return this.preferences.cameraDeviceID;
  }
  get hotkey() {
    return this.preferences.hotkey;
  }
  get hasCompletedOnboarding() {
    return this.preferences.hasCompletedOnboarding;
  }
  get username() {
    return this.preferences.username;
  }
  get email() {
    return this.preferences.email;
  }
  get availableWorkspaces() {
    return this.preferences.workspaces;
  }
  get activeWorkspaceID() {
    return this.preferences.activeWorkspaceID;
  }
  get activeWorkspaceName() {
    return this.preferences.activeWorkspaceName;
  }
  get sessionExpiresAt() {
    const value = this.preferences.sessionExpiresAt;
    return value ? new Date(value) : null;
  }
  get apiToken() {
    return this.apiTokenValue;
  }
  get sessionToken() {
    return this.sessionTokenValue;
  }

  get isServerConfigured() {
    return isAllowedServerURL(this.serverURL) && this.apiToken.length > 0;
  }

  get isAuthenticated() {
    return (
      this.sessionToken.length > 0 &&
      this.username.length > 0 &&
      this.activeWorkspaceID !== null &&
      this.apiToken.length > 0
    );
  }

  get hasStoredSession() {
    return this.sessionToken.length > 0;
  }

  update(changes: Partial<EditablePreferences>) {
    const next = { ...this.preferences };
    if (typeof changes.serverURL === "string") {
      next.serverURL = changes.serverURL.trim();
    }
    if (typeof changes.recorderName === "string") {
      next.recorderName = changes.recorderName.slice(0, 120);
    }
    for (const key of [
      "capturesSystemAudio",
      "capturesMicrophone",
      "showsWebcam",
    ] as const) {
      if (typeof changes[key] === "boolean") {
        next[key] = changes[key];
      }
    }
    for (const key of ["microphoneDeviceID", "cameraDeviceID"] as const) {
      const value = changes[key];
      if (value === null || typeof value === "string") {
        next[key] = value || null;
      }
    }
    if (isHotkeyChoice(changes.hotkey)) {
      next.hotkey = changes.hotkey;
    }
    this.commit(next);
  }

  markOnboardingComplete() {
    this.commit({ ...this.preferences, hasCompletedOnboarding: true });
  }

  applyLogin(response: DeviceLoginResponse) {
    const account = recorderTokenAccount(response.activeWorkspace.id);
    this.vault.set(account, response.recorderToken.token);
    try {
      this.vault.set(SECRET.sessionToken, response.sessionToken);
    } catch (error) {
      this.safelyRemove(account);
      throw error;
    }
    this.safelyRemove(SECRET.apiToken);
    const nextIDs = new Set(response.workspaces.map((workspace) => workspace.id));
    for (const workspace of this.preferences.workspaces) {
      if (!nextIDs.has(workspace.id)) {
        this.safelyRemove(recorderTokenAccount(workspace.id));
      }
    }

    this.sessionTokenValue = response.sessionToken;
    this.apiTokenValue = response.recorderToken.token;
    this.commit({
      ...this.preferences,
      ...userFields(response.user),
      workspaces: response.workspaces,
      activeWorkspaceID: response.activeWorkspace.id,
      activeWorkspaceName: response.activeWorkspace.name,
      sessionExpiresAt: response.sessionExpiresAt,
    });
  }

  applyValidatedSession(response: DeviceSessionResponse) {
    const currentIDs = new Set(
      response.workspaces.map((workspace) => workspace.id),
    );
    for (const workspace of this.preferences.workspaces) {
      if (!currentIDs.has(workspace.id)) {
        this.safelyRemove(recorderTokenAccount(workspace.id));
      }
    }

    const next: Preferences = {
      ...this.preferences,
      ...userFields(response.user),
      workspaces: response.workspaces,
      sessionExpiresAt: response.sessionExpiresAt,
    };
    const active = response.workspaces.find(
      (workspace) => workspace.id === this.preferences.activeWorkspaceID,
    );
    if (active) {
      next.activeWorkspaceName = active.name;
    } else {
      this.apiTokenValue = "";
      next.activeWorkspaceID = null;
      next.activeWorkspaceName = null;
    }
    this.commit(next);
  }

  applyWorkspaceSwitch(response: WorkspaceSwitchResponse) {
    this.vault.set(
      recorderTokenAccount(response.activeWorkspace.id),
      response.recorderToken.token,
    );
    this.apiTokenValue = response.recorderToken.token;
    this.commit({
      ...this.preferences,
      activeWorkspaceID: response.activeWorkspace.id,
      activeWorkspaceName: response.activeWorkspace.name,
    });
  }

  clearAuthentication() {
    let firstError: unknown = null;
    const remove = (account: string) => {
      try {
        this.vault.remove(account);
      } catch (error) {
        firstError ??= error;
      }
    };
    remove(SECRET.sessionToken);
    remove(SECRET.apiToken);
    for (const workspace of this.preferences.workspaces) {
      remove(recorderTokenAccount(workspace.id));
    }

    this.sessionTokenValue = "";
    this.apiTokenValue = "";
    this.commit({
      ...this.preferences,
      username: "",
      email: "",
      workspaces: [],
      activeWorkspaceID: null,
      activeWorkspaceName: null,
      sessionExpiresAt: null,
    });
    if (firstError) {
      throw firstError;
    }
  }

  useManualConfiguration(serverURL: string, apiToken: string) {
    this.clearAuthentication();
    this.vault.set(SECRET.apiToken, apiToken);
    this.apiTokenValue = apiToken;
    this.commit({ ...this.preferences, serverURL });
  }

  private safelyRemove(account: string) {
    try {
      this.vault.remove(account);
    } catch {
      // A stale token that cannot be removed is revoked server-side on logout.
    }
  }

  private commit(next: Preferences) {
    this.preferences = next;
    this.file.write({ ...next });
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function userFields(user: AuthUser) {
  return { username: user.username, email: user.email };
}

function readPreferences(
  stored: Record<string, unknown>,
  defaultRecorderName: string,
): Preferences {
  const string = (key: string) =>
    typeof stored[key] === "string" ? (stored[key] as string) : null;
  const boolean = (key: string, fallback: boolean) =>
    typeof stored[key] === "boolean" ? (stored[key] as boolean) : fallback;

  return {
    serverURL: "serverURL" in stored ? (string("serverURL") ?? "") : PRODUCTION_SERVER_URL,
    recorderName: string("recorderName") ?? defaultRecorderName,
    capturesSystemAudio: boolean("capturesSystemAudio", true),
    capturesMicrophone: boolean("capturesMicrophone", true),
    showsWebcam: boolean("showsWebcam", false),
    microphoneDeviceID: string("microphoneDeviceID") || null,
    cameraDeviceID: string("cameraDeviceID") || null,
    hotkey: isHotkeyChoice(stored.hotkey) ? stored.hotkey : DEFAULT_HOTKEY,
    hasCompletedOnboarding: boolean("hasCompletedOnboarding", false),
    username: string("username") ?? "",
    email: string("email") ?? "",
    workspaces: readWorkspaces(stored.workspaces),
    activeWorkspaceID: string("activeWorkspaceID"),
    activeWorkspaceName: string("activeWorkspaceName"),
    sessionExpiresAt: string("sessionExpiresAt"),
  };
}

function readWorkspaces(value: unknown): AuthWorkspace[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (workspace): workspace is AuthWorkspace =>
      typeof workspace === "object" &&
      workspace !== null &&
      typeof workspace.id === "string" &&
      typeof workspace.name === "string" &&
      typeof workspace.slug === "string" &&
      typeof workspace.role === "string",
  );
}
