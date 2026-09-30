import { AuthError, type AuthService } from "./auth";
import { isAllowedServerURL } from "./server-url";
import type { RecorderSettings } from "./settings";

export type AccountDependencies = {
  settings: RecorderSettings;
  createAuthService: (baseURL: string) => AuthService;
  deviceName: string;
  canChangeAuthentication: () => boolean;
  now?: () => Date;
};

export class AccountController {
  private authenticating = false;
  private error: string | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly dependencies: AccountDependencies) {}

  get isAuthenticating() {
    return this.authenticating;
  }

  get authenticationError() {
    return this.error;
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setError(message: string | null) {
    this.error = message;
    this.emit();
  }

  async login(username: string, password: string) {
    if (this.authenticating) {
      return;
    }
    const trimmed = username.trim();
    if (!trimmed || !password) {
      this.setError(new AuthError("missingCredentials").message);
      return;
    }

    this.begin();
    try {
      const response = await this.authService().login(
        trimmed,
        password,
        this.dependencies.deviceName,
      );
      if (
        !response.workspaces.some(
          (workspace) => workspace.id === response.activeWorkspace.id,
        ) ||
        !response.sessionToken ||
        !response.recorderToken.token
      ) {
        throw new AuthError("invalidResponse");
      }
      this.dependencies.settings.applyLogin(response);
    } catch (error) {
      this.error = userFacingMessage(error);
    } finally {
      this.end();
    }
  }

  async validateStoredSession() {
    const { settings } = this.dependencies;
    if (!settings.hasStoredSession) {
      return;
    }

    const now = this.dependencies.now?.() ?? new Date();
    const expiresAt = settings.sessionExpiresAt;
    if (expiresAt && expiresAt <= now) {
      this.clearLocalAuthentication();
      this.setError("Your session expired. Sign in again.");
      return;
    }

    this.begin();
    try {
      const response = await this.authService().validateSession(
        settings.sessionToken,
      );
      const fallback = response.workspaces[0];
      if (!fallback) {
        throw new AuthError("noWorkspace");
      }
      settings.applyValidatedSession(response);
      const activeIsAvailable = response.workspaces.some(
        (workspace) => workspace.id === settings.activeWorkspaceID,
      );
      if (!activeIsAvailable || !settings.apiToken) {
        await this.performWorkspaceSwitch(
          activeIsAvailable
            ? (settings.activeWorkspaceID ?? fallback.id)
            : fallback.id,
        );
      }
    } catch (error) {
      if (
        error instanceof AuthError &&
        (error.kind === "unauthorized" || error.kind === "noWorkspace")
      ) {
        this.clearLocalAuthentication();
      }
      this.error = userFacingMessage(error);
    } finally {
      this.end();
    }
  }

  async switchWorkspace(workspaceID: string) {
    if (this.authenticating) {
      return;
    }
    this.begin();
    try {
      await this.performWorkspaceSwitch(workspaceID);
    } catch (error) {
      this.error = userFacingMessage(error);
    } finally {
      this.end();
    }
  }

  async signOut() {
    if (this.authenticating) {
      return;
    }
    if (!this.dependencies.canChangeAuthentication()) {
      this.setError(
        "Finish the current recording or upload before signing out.",
      );
      return;
    }

    this.begin();
    const sessionToken = this.dependencies.settings.sessionToken;
    let remoteError: unknown = null;
    if (sessionToken) {
      try {
        await this.authService().logout(sessionToken);
      } catch (error) {
        remoteError = error;
      }
    }
    this.clearLocalAuthentication();
    if (remoteError) {
      this.error =
        "Signed out on this computer. The server could not revoke the session: " +
        userFacingMessage(remoteError);
    }
    this.end();
  }

  useManualConfiguration(serverURL: string, apiToken: string) {
    const url = serverURL.trim();
    const token = apiToken.trim();
    if (!isAllowedServerURL(url) || !token) {
      this.setError("Enter a valid server URL and recorder token.");
      return;
    }
    if (!this.dependencies.canChangeAuthentication()) {
      this.setError(
        "Finish the current recording or upload before changing servers.",
      );
      return;
    }
    try {
      this.dependencies.settings.useManualConfiguration(url, token);
      this.setError(null);
    } catch (error) {
      this.setError(userFacingMessage(error));
    }
  }

  private async performWorkspaceSwitch(workspaceID: string) {
    const { settings } = this.dependencies;
    if (workspaceID === settings.activeWorkspaceID && settings.apiToken) {
      return;
    }
    if (!this.dependencies.canChangeAuthentication()) {
      throw AuthError.server(409, "Finish the current recording or upload first.");
    }
    if (
      !settings.availableWorkspaces.some(
        (workspace) => workspace.id === workspaceID,
      )
    ) {
      throw new AuthError("noWorkspace");
    }
    if (!settings.sessionToken) {
      throw new AuthError(
        "unauthorized",
        "Sign in again to switch workspaces.",
      );
    }

    const response = await this.authService().switchWorkspace(
      settings.sessionToken,
      workspaceID,
      this.dependencies.deviceName,
    );
    if (
      response.activeWorkspace.id !== workspaceID ||
      !response.recorderToken.token
    ) {
      throw new AuthError("invalidResponse");
    }
    settings.applyWorkspaceSwitch(response);
  }

  private authService() {
    const { serverURL } = this.dependencies.settings;
    if (!isAllowedServerURL(serverURL)) {
      throw new AuthError("invalidConfiguration");
    }
    return this.dependencies.createAuthService(serverURL);
  }

  private clearLocalAuthentication() {
    try {
      this.dependencies.settings.clearAuthentication();
    } catch (error) {
      this.error = userFacingMessage(error);
    }
  }

  private begin() {
    this.authenticating = true;
    this.error = null;
    this.emit();
  }

  private end() {
    this.authenticating = false;
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function userFacingMessage(error: unknown) {
  if (error instanceof AuthError) {
    return error.message;
  }
  if (error instanceof Error && error.name === "SecretStorageError") {
    return error.message;
  }
  return "Authentication could not be completed. Check your connection and try again.";
}
