import { contextBridge, ipcRenderer } from "electron";

import {
  type AppCommand,
  type AppSnapshot,
  type CaptureBridge,
  type CaptureCommandEnvelope,
  type CaptureEvent,
  type CaptureReply,
  CHANNELS,
  type ScreenlyBridge,
} from "../shared/ipc";

function currentPlatform(): ScreenlyBridge["platform"] {
  switch (process.platform) {
    case "win32":
    case "linux":
    case "darwin":
      return process.platform;
    default:
      return "other";
  }
}

const bridge: ScreenlyBridge = {
  platform: currentPlatform(),
  getSnapshot: () => ipcRenderer.invoke(CHANNELS.snapshot) as Promise<AppSnapshot>,
  onSnapshot(listener) {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) =>
      listener(snapshot);
    ipcRenderer.on(CHANNELS.snapshot, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.snapshot, handler);
    };
  },
  command: <T>(command: AppCommand) =>
    ipcRenderer.invoke(CHANNELS.command, command) as Promise<T>,
};

const capture: CaptureBridge = {
  onCommand(listener) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      envelope: CaptureCommandEnvelope,
    ) => listener(envelope);
    ipcRenderer.on(CHANNELS.captureCommand, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.captureCommand, handler);
    };
  },
  reply: (reply: CaptureReply) => ipcRenderer.send(CHANNELS.captureReply, reply),
  writeChunk: (chunk: ArrayBuffer) =>
    ipcRenderer.invoke(CHANNELS.captureChunk, chunk) as Promise<void>,
  emit: (event: CaptureEvent) => ipcRenderer.send(CHANNELS.captureEvent, event),
};

contextBridge.exposeInMainWorld("screenly", bridge);
contextBridge.exposeInMainWorld("screenlyCapture", capture);
