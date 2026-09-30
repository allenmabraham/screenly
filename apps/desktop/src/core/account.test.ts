import assert from "node:assert/strict";
import test from "node:test";

import { AccountController } from "./account";
import { AuthService } from "./auth";
import type { FetchLike } from "./http";
import { RecorderSettings } from "./settings";
import {
  MemoryPreferences,
  MemoryVault,
  WORKSPACE_A,
  WORKSPACE_B,
  jsonResponse,
  loginResponse,
} from "./test-support";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function makeAccount(
  handler: (call: Call) => Response,
  options: { canChange?: () => boolean; now?: Date } = {},
) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return handler(call);
  };
  const settings = new RecorderSettings(
    new MemoryPreferences({ serverURL: "https://video.example.com" }),
    new MemoryVault(),
    { recorderName: "Ada" },
  );
  const account = new AccountController({
    settings,
    createAuthService: (baseURL) => new AuthService(baseURL, fetchImpl),
    deviceName: "ADA-LAPTOP",
    canChangeAuthentication: options.canChange ?? (() => true),
    now: options.now ? () => options.now as Date : undefined,
  });
  return { account, settings, calls };
}

test("login sends the device name and applies the response", async () => {
  const { account, settings, calls } = makeAccount(() =>
    jsonResponse(201, loginResponse()),
  );
  await account.login("  ada ", "correct horse battery");
  assert.equal(account.authenticationError, null);
  assert.equal(settings.isAuthenticated, true);
  assert.equal(calls[0]?.url, "https://video.example.com/api/auth/device/session");
  assert.deepEqual(calls[0]?.body, {
    username: "ada",
    password: "correct horse battery",
    deviceName: "ADA-LAPTOP",
  });
});

test("login surfaces the server's error message", async () => {
  const { account, settings } = makeAccount(() =>
    jsonResponse(401, {
      error: { message: "The username or password is incorrect." },
    }),
  );
  await account.login("ada", "wrong");
  assert.equal(
    account.authenticationError,
    "The username or password is incorrect.",
  );
  assert.equal(settings.isAuthenticated, false);
  assert.equal(account.isAuthenticating, false);
});

test("login rejects empty credentials without a request", async () => {
  const { account, calls } = makeAccount(() => jsonResponse(500));
  await account.login(" ", "");
  assert.equal(calls.length, 0);
  assert.equal(
    account.authenticationError,
    "Enter both your username and password.",
  );
});

test("expired sessions are cleared before contacting the server", async () => {
  const { account, settings, calls } = makeAccount(
    () => jsonResponse(201, loginResponse({ sessionExpiresAt: "2026-01-01T00:00:00Z" })),
    { now: new Date("2026-06-01T00:00:00Z") },
  );
  await account.login("ada", "password");
  calls.length = 0;
  await account.validateStoredSession();
  assert.equal(calls.length, 0);
  assert.equal(settings.hasStoredSession, false);
  assert.equal(account.authenticationError, "Your session expired. Sign in again.");
});

test("validation switches to a remaining workspace when access was removed", async () => {
  let loggedIn = false;
  const { account, settings, calls } = makeAccount((call) => {
    if (!loggedIn) {
      loggedIn = true;
      return jsonResponse(201, loginResponse());
    }
    if (call.method === "GET") {
      return jsonResponse(200, {
        user: loginResponse().user,
        workspaces: [WORKSPACE_B],
        sessionExpiresAt: "2099-01-01T00:00:00.000Z",
      });
    }
    return jsonResponse(201, {
      activeWorkspace: WORKSPACE_B,
      recorderToken: { ...loginResponse().recorderToken, token: "token-b" },
    });
  });
  await account.login("ada", "password");
  await account.validateStoredSession();
  assert.equal(account.authenticationError, null);
  assert.equal(settings.activeWorkspaceID, WORKSPACE_B.id);
  assert.equal(settings.apiToken, "token-b");
  assert.equal(calls.at(-1)?.url, "https://video.example.com/api/auth/device/workspace");
  assert.equal(calls.at(-1)?.headers.Authorization, "Bearer session-token");
});

test("a revoked session signs the device out", async () => {
  let loggedIn = false;
  const { account, settings } = makeAccount(() => {
    if (!loggedIn) {
      loggedIn = true;
      return jsonResponse(201, loginResponse());
    }
    return jsonResponse(401, { error: { message: "Session revoked." } });
  });
  await account.login("ada", "password");
  await account.validateStoredSession();
  assert.equal(settings.hasStoredSession, false);
  assert.equal(account.authenticationError, "Session revoked.");
});

test("sign-out is blocked while a recording is active", async () => {
  const { account, settings } = makeAccount(() => jsonResponse(201, loginResponse()), {
    canChange: () => false,
  });
  await account.login("ada", "password");
  await account.signOut();
  assert.equal(settings.isAuthenticated, true);
  assert.equal(
    account.authenticationError,
    "Finish the current recording or upload before signing out.",
  );
});

test("sign-out clears local state even when revocation fails", async () => {
  let loggedIn = false;
  const { account, settings } = makeAccount(() => {
    if (!loggedIn) {
      loggedIn = true;
      return jsonResponse(201, loginResponse());
    }
    return jsonResponse(503);
  });
  await account.login("ada", "password");
  await account.signOut();
  assert.equal(settings.hasStoredSession, false);
  assert.match(
    account.authenticationError ?? "",
    /^Signed out on this computer\. The server could not revoke the session: Sign-in failed \(503\)/,
  );
});

test("switching to the active workspace is a no-op", async () => {
  const { account, calls } = makeAccount(() => jsonResponse(201, loginResponse()));
  await account.login("ada", "password");
  await account.switchWorkspace(WORKSPACE_A.id);
  assert.equal(calls.length, 1);
});

test("manual configuration validates the server URL", () => {
  const { account, settings } = makeAccount(() => jsonResponse(500));
  account.useManualConfiguration("http://video.example.com", "token");
  assert.equal(
    account.authenticationError,
    "Enter a valid server URL and recorder token.",
  );
  account.useManualConfiguration("http://localhost:3000", " token ");
  assert.equal(account.authenticationError, null);
  assert.equal(settings.apiToken, "token");
});
