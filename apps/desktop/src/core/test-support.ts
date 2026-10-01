import type { DeviceLoginResponse } from "./auth";
import type { PreferencesFile, SecretVault } from "./settings";

export class MemoryVault implements SecretVault {
  readonly values = new Map<string, string>();
  failingAccounts = new Set<string>();

  get(account: string) {
    return this.values.get(account) ?? "";
  }

  set(account: string, value: string) {
    if (this.failingAccounts.has(account)) {
      const error = new Error("The secret could not be saved.");
      error.name = "SecretStorageError";
      throw error;
    }
    this.values.set(account, value);
  }

  remove(account: string) {
    this.values.delete(account);
  }
}

export class MemoryPreferences implements PreferencesFile {
  constructor(public values: Record<string, unknown> = {}) {}

  read() {
    return structuredClone(this.values);
  }

  write(values: Record<string, unknown>) {
    this.values = structuredClone(values);
  }
}

export const WORKSPACE_A = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Screenly",
  slug: "screenly",
  role: "owner",
};

export const WORKSPACE_B = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Design",
  slug: "design",
  role: "member",
};

export function loginResponse(
  overrides: Partial<DeviceLoginResponse> = {},
): DeviceLoginResponse {
  return {
    sessionToken: "session-token",
    sessionExpiresAt: "2099-01-01T00:00:00.000Z",
    user: { id: "user-1", username: "ada", email: "ada@example.com" },
    workspaces: [WORKSPACE_A, WORKSPACE_B],
    activeWorkspace: WORKSPACE_A,
    recorderToken: {
      id: "token-1",
      name: "Laptop",
      tokenPrefix: "scr_abc",
      createdAt: "2026-01-01T00:00:00.000Z",
      token: "recorder-token-a",
    },
    ...overrides,
  };
}

export function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
