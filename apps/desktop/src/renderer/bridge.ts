import { useEffect, useState } from "react";

import type {
  AppCommand,
  AppSnapshot,
  CaptureBridge,
  ScreenlyBridge,
} from "../shared/ipc";

declare global {
  interface Window {
    screenly: ScreenlyBridge;
    screenlyCapture: CaptureBridge;
  }
}

export const screenly = () => window.screenly;

export function command<T = unknown>(value: AppCommand) {
  return window.screenly.command<T>(value);
}

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.screenly.onSnapshot((next) => {
      if (active) {
        setSnapshot(next);
      }
    });
    void window.screenly.getSnapshot().then((initial) => {
      if (active) {
        setSnapshot((current) => current ?? initial);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return snapshot;
}

export function useMediaDevices(kind: "audioinput" | "videoinput", enabled: boolean) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (active) {
          setDevices(
            all.filter(
              (device) =>
                device.kind === kind &&
                device.deviceId !== "default" &&
                device.deviceId !== "communications",
            ),
          );
        }
      } catch {
        if (active) {
          setDevices([]);
        }
      }
    };
    void refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
    };
  }, [kind, enabled]);

  return devices;
}
