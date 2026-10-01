import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCTION_SERVER_URL,
  RecorderSettings,
  recorderTokenAccount,
} from "./settings";
import {
  MemoryPreferences,
  MemoryVault,
  WORKSPACE_A,
  WORKSPACE_B,
  loginResponse,
} from "./test-support";

function makeSettings(
  preferences = new MemoryPreferences(),
  vault = new MemoryVault(),
) {
  return {
    preferences,
    vault,
    settings: new RecorderSettings(preferences, vault, {
      recorderName: "Ada Lovelace",
    }),
  };
}

test("fresh installs default to the production server and all audio", () => {
  const { settings } = makeSettings();
  assert.equal(settings.serverURL, PRODUCTION_SERVER_URL);
  assert.equal(settings.recorderName, "Ada Lovelace");
  assert.equal(settings.capturesSystemAudio, true);
  assert.equal(settings.capturesMicrophone, true);
  assert.equal(settings.showsWebcam, false);
  assert.equal(settings.hotkey, "altShiftR");
  assert.equal(settings.isServerConfigured, false);
  assert.equal(settings.isAuthenticated, false);
});

test("an explicitly cleared server URL is not replaced by the default", () => {
  const { settings } = makeSettings(new MemoryPreferences({ serverURL: "" }));
  assert.equal(settings.serverURL, "");
});

test("login stores tokens in the vault and account details in preferences", () => {
  const { settings, preferences, vault } = makeSettings();
  vault.set("apiToken", "manual-token");
  settings.applyLogin(loginResponse());

  assert.equal(settings.isAuthenticated, true);
  assert.equal(settings.isServerConfigured, true);
  assert.equal(settings.apiToken, "recorder-token-a");
  assert.equal(vault.get("userSessionToken"), "session-token");
  assert.equal(vault.get(recorderTokenAccount(WORKSPACE_A.id)), "recorder-token-a");
  assert.equal(vault.get("apiToken"), "");
  assert.equal(preferences.values.activeWorkspaceName, "Screenly");
  assert.equal(JSON.stringify(preferences.values).includes("token"), false);

  const reloaded = makeSettings(preferences, vault).settings;
  assert.equal(reloaded.isAuthenticated, true);
  assert.equal(reloaded.apiToken, "recorder-token-a");
  assert.equal(reloaded.username, "ada");
});

test("a failed session write rolls back the recorder token", () => {
  const { settings, vault } = makeSettings();
  vault.failingAccounts.add("userSessionToken");
  assert.throws(() => settings.applyLogin(loginResponse()), /could not be saved/);
  assert.equal(vault.get(recorderTokenAccount(WORKSPACE_A.id)), "");
  assert.equal(settings.isAuthenticated, false);
});

test("workspace switches use a per-workspace recorder token", () => {
  const { settings, vault } = makeSettings();
  settings.applyLogin(loginResponse());
  settings.applyWorkspaceSwitch({
    activeWorkspace: WORKSPACE_B,
    recorderToken: { ...loginResponse().recorderToken, token: "recorder-token-b" },
  });
  assert.equal(settings.activeWorkspaceID, WORKSPACE_B.id);
  assert.equal(settings.apiToken, "recorder-token-b");
  assert.equal(vault.get(recorderTokenAccount(WORKSPACE_B.id)), "recorder-token-b");
});

test("validated sessions drop workspaces the user no longer belongs to", () => {
  const { settings, vault } = makeSettings();
  settings.applyLogin(loginResponse());
  settings.applyValidatedSession({
    user: { id: "user-1", username: "ada", email: "new@example.com" },
    workspaces: [WORKSPACE_B],
    sessionExpiresAt: "2099-02-01T00:00:00.000Z",
  });
  assert.equal(settings.email, "new@example.com");
  assert.equal(settings.activeWorkspaceID, null);
  assert.equal(settings.apiToken, "");
  assert.equal(vault.get(recorderTokenAccount(WORKSPACE_A.id)), "");
  assert.deepEqual(settings.availableWorkspaces, [WORKSPACE_B]);
});

test("clearing authentication removes every stored secret", () => {
  const { settings, vault } = makeSettings();
  settings.applyLogin(loginResponse());
  settings.clearAuthentication();
  assert.equal(vault.values.size, 0);
  assert.equal(settings.isAuthenticated, false);
  assert.equal(settings.username, "");
});

test("manual configuration signs out and stores the recorder token", () => {
  const { settings, vault } = makeSettings();
  settings.applyLogin(loginResponse());
  settings.useManualConfiguration("http://localhost:3000", "manual-token");
  assert.equal(settings.serverURL, "http://localhost:3000");
  assert.equal(settings.apiToken, "manual-token");
  assert.equal(settings.isServerConfigured, true);
  assert.equal(settings.isAuthenticated, false);
  assert.equal(vault.get("userSessionToken"), "");
});

test("preference updates are validated before they are saved", () => {
  const { settings, preferences } = makeSettings();
  let changes = 0;
  settings.onChange(() => {
    changes += 1;
  });
  settings.update({
    showsWebcam: true,
    microphoneDeviceID: "",
    cameraDeviceID: "camera-1",
    hotkey: "ctrlAltR",
    recorderName: "x".repeat(200),
  });
  settings.update({ hotkey: "nope" as never });
  assert.equal(changes, 2);
  assert.equal(settings.showsWebcam, true);
  assert.equal(settings.microphoneDeviceID, null);
  assert.equal(settings.cameraDeviceID, "camera-1");
  assert.equal(settings.hotkey, "ctrlAltR");
  assert.equal(settings.recorderName.length, 120);
  assert.equal(preferences.values.hotkey, "ctrlAltR");
});
