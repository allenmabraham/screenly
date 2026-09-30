export type RecordingState =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "countdown"; count: number }
  | { kind: "recording" }
  | { kind: "paused" }
  | { kind: "finishing" }
  | { kind: "uploading"; progress: number }
  | { kind: "uploaded"; shareURL: string }
  | { kind: "failed"; message: string };

export function isActiveState(state: RecordingState) {
  return (
    state.kind === "countdown" ||
    state.kind === "recording" ||
    state.kind === "paused" ||
    state.kind === "finishing"
  );
}

export function isTerminalState(state: RecordingState) {
  return state.kind === "uploaded" || state.kind === "failed";
}

export function isCapturingState(state: RecordingState) {
  return state.kind === "recording" || state.kind === "paused";
}

export function canChangeAuthentication(state: RecordingState) {
  return state.kind === "idle" || state.kind === "uploaded";
}

export function formatElapsed(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
