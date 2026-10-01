import {
  type FetchLike,
  readErrorMessage,
  statusText,
  withTimeout,
} from "./http";
import { joinServerPath } from "./server-url";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
};

export type AuthWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type RecorderToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  token: string;
};

export type DeviceLoginResponse = {
  sessionToken: string;
  sessionExpiresAt: string;
  user: AuthUser;
  workspaces: AuthWorkspace[];
  activeWorkspace: AuthWorkspace;
  recorderToken: RecorderToken;
};

export type DeviceSessionResponse = {
  user: AuthUser;
  workspaces: AuthWorkspace[];
  sessionExpiresAt: string;
};

export type WorkspaceSwitchResponse = {
  activeWorkspace: AuthWorkspace;
  recorderToken: RecorderToken;
};

export type AuthErrorKind =
  | "invalidConfiguration"
  | "invalidResponse"
  | "missingCredentials"
  | "noWorkspace"
  | "unauthorized"
  | "server";

export class AuthError extends Error {
  readonly kind: AuthErrorKind;
  readonly status: number | null;

  constructor(kind: AuthErrorKind, message?: string, status?: number) {
    super(message ?? AuthError.defaultMessage(kind));
    this.name = "AuthError";
    this.kind = kind;
    this.status = status ?? null;
  }

  static server(status: number, message: string) {
    return new AuthError("server", `Sign-in failed (${status}): ${message}`, status);
  }

  private static defaultMessage(kind: AuthErrorKind) {
    switch (kind) {
      case "invalidConfiguration":
        return "Enter a valid HTTPS server URL (or localhost for development).";
      case "invalidResponse":
        return "The server returned an invalid authentication response.";
      case "missingCredentials":
        return "Enter both your username and password.";
      case "noWorkspace":
        return "Your account does not have an available workspace.";
      case "unauthorized":
        return "Your sign-in is no longer valid.";
      case "server":
        return "Sign-in failed.";
    }
  }
}

export class AuthService {
  constructor(
    private readonly baseURL: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  login(username: string, password: string, deviceName: string) {
    return this.send<DeviceLoginResponse>("POST", {
      body: { username, password, deviceName },
      validate: isDeviceLoginResponse,
    });
  }

  validateSession(sessionToken: string) {
    return this.send<DeviceSessionResponse>("GET", {
      sessionToken,
      validate: isDeviceSessionResponse,
    });
  }

  async logout(sessionToken: string) {
    const response = await this.fetchImpl(
      joinServerPath(this.baseURL, "api/auth/device/session"),
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionToken}` },
        signal: withTimeout(undefined, 30_000),
      },
    );
    if (response.status !== 204 && response.status !== 401) {
      throw await this.serverError(response);
    }
  }

  switchWorkspace(
    sessionToken: string,
    workspaceID: string,
    deviceName: string,
  ) {
    return this.send<WorkspaceSwitchResponse>("POST", {
      path: "api/auth/device/workspace",
      sessionToken,
      body: { workspaceId: workspaceID, deviceName },
      validate: isWorkspaceSwitchResponse,
    });
  }

  private async send<T>(
    method: string,
    options: {
      path?: string;
      sessionToken?: string;
      body?: unknown;
      validate: (value: unknown) => value is T;
    },
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.sessionToken) {
      headers.Authorization = `Bearer ${options.sessionToken}`;
    }
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await this.fetchImpl(
      joinServerPath(this.baseURL, options.path ?? "api/auth/device/session"),
      {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: withTimeout(undefined, 30_000),
      },
    );
    if (!response.ok) {
      throw await this.serverError(response);
    }

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new AuthError("invalidResponse");
    }
    if (!options.validate(value)) {
      throw new AuthError("invalidResponse");
    }
    return value;
  }

  private async serverError(response: Response) {
    const message = await readErrorMessage(response);
    if (response.status === 401) {
      return new AuthError("unauthorized", message ?? undefined, 401);
    }
    return AuthError.server(
      response.status,
      message ?? statusText(response.status),
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isDate(value: unknown): value is string {
  return isString(value) && !Number.isNaN(Date.parse(value));
}

function isUser(value: unknown): value is AuthUser {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.username) &&
    isString(value.email)
  );
}

function isWorkspace(value: unknown): value is AuthWorkspace {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.slug) &&
    isString(value.role)
  );
}

function isRecorderToken(value: unknown): value is RecorderToken {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.tokenPrefix) &&
    isDate(value.createdAt) &&
    isString(value.token)
  );
}

function isWorkspaceList(value: unknown): value is AuthWorkspace[] {
  return Array.isArray(value) && value.every(isWorkspace);
}

export function isDeviceLoginResponse(
  value: unknown,
): value is DeviceLoginResponse {
  return (
    isObject(value) &&
    isString(value.sessionToken) &&
    isDate(value.sessionExpiresAt) &&
    isUser(value.user) &&
    isWorkspaceList(value.workspaces) &&
    isWorkspace(value.activeWorkspace) &&
    isRecorderToken(value.recorderToken)
  );
}

export function isDeviceSessionResponse(
  value: unknown,
): value is DeviceSessionResponse {
  return (
    isObject(value) &&
    isUser(value.user) &&
    isWorkspaceList(value.workspaces) &&
    isDate(value.sessionExpiresAt)
  );
}

export function isWorkspaceSwitchResponse(
  value: unknown,
): value is WorkspaceSwitchResponse {
  return (
    isObject(value) &&
    isWorkspace(value.activeWorkspace) &&
    isRecorderToken(value.recorderToken)
  );
}
