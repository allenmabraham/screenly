import { app, safeStorage } from "electron";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { PreferencesFile, SecretVault } from "../core/settings";

export function mediaDirectory() {
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || app.getPath("appData"),
      "Screenly",
    );
  }
  const dataHome = process.env.XDG_DATA_HOME || path.join(homedir(), ".local", "share");
  return path.join(dataHome, "screenly");
}

export function recordingsDirectory() {
  return path.join(mediaDirectory(), "Recordings");
}

export function uploadsDirectory() {
  return path.join(mediaDirectory(), "Uploads");
}

export class JSONPreferencesFile implements PreferencesFile {
  private readonly filePath = path.join(app.getPath("userData"), "preferences.json");

  read() {
    return readJSON(this.filePath);
  }

  write(values: Record<string, unknown>) {
    writeJSONAtomically(this.filePath, values);
  }
}

type StoredSecret = { encoding: "safeStorage" | "plain"; value: string };

export class SafeStorageVault implements SecretVault {
  private readonly filePath = path.join(app.getPath("userData"), "secrets.json");

  get isEncrypted() {
    if (!safeStorage.isEncryptionAvailable()) {
      return false;
    }
    return (
      process.platform !== "linux" ||
      safeStorage.getSelectedStorageBackend() !== "basic_text"
    );
  }

  get(account: string) {
    const entry = this.entries()[account];
    if (!entry) {
      return "";
    }
    try {
      return entry.encoding === "safeStorage"
        ? safeStorage.decryptString(Buffer.from(entry.value, "base64"))
        : entry.value;
    } catch {
      return "";
    }
  }

  set(account: string, value: string) {
    const entries = this.entries();
    try {
      entries[account] = safeStorage.isEncryptionAvailable()
        ? {
            encoding: "safeStorage",
            value: safeStorage.encryptString(value).toString("base64"),
          }
        : { encoding: "plain", value };
      writeJSONAtomically(this.filePath, entries);
    } catch (cause) {
      throw secretStorageError(cause);
    }
  }

  remove(account: string) {
    const entries = this.entries();
    if (!(account in entries)) {
      return;
    }
    delete entries[account];
    try {
      writeJSONAtomically(this.filePath, entries);
    } catch (cause) {
      throw secretStorageError(cause);
    }
  }

  private entries() {
    const stored = readJSON(this.filePath);
    const entries: Record<string, StoredSecret> = {};
    for (const [account, entry] of Object.entries(stored)) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        ((entry as StoredSecret).encoding === "safeStorage" ||
          (entry as StoredSecret).encoding === "plain") &&
        typeof (entry as StoredSecret).value === "string"
      ) {
        entries[account] = entry as StoredSecret;
      }
    }
    return entries;
  }
}

function secretStorageError(cause: unknown) {
  const error = new Error(
    "Screenly could not save your sign-in securely on this computer.",
    { cause },
  );
  error.name = "SecretStorageError";
  return error;
}

function readJSON(filePath: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function writeJSONAtomically(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporary, filePath);
}
