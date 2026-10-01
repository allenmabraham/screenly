import { useCallback, useEffect, useRef, useState } from "react";

import type { AppSnapshot, CaptureMode, CaptureSource } from "../../shared/ipc";
import { command, useMediaDevices, useSnapshot } from "../bridge";
import {
  Button,
  DeviceSelect,
  Icon,
  type IconName,
  Message,
  Spinner,
  Switch,
} from "../components";
import { mount } from "../mount";

const MODES: { mode: CaptureMode; title: string; icon: IconName }[] = [
  { mode: "display", title: "Full screen", icon: "monitor" },
  { mode: "window", title: "Window", icon: "window" },
  { mode: "area", title: "Area", icon: "area" },
];

function RecordingSetup() {
  const snapshot = useSnapshot();
  if (!snapshot) {
    return null;
  }
  return <SetupForm snapshot={snapshot} />;
}

function SetupForm({ snapshot }: { snapshot: AppSnapshot }) {
  const portalOnly = snapshot.isWayland;
  const [mode, setMode] = useState<CaptureMode>(portalOnly ? "portal" : "display");
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [loading, setLoading] = useState(!portalOnly);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string | null>>({});
  const [starting, setStarting] = useState(false);

  const { preferences, recorder, mediaAccess } = snapshot;
  const microphones = useMediaDevices("audioinput", preferences.capturesMicrophone);
  const cameras = useMediaDevices("videoinput", preferences.showsWebcam);
  const sourceKey = mode === "window" ? "window" : "screen";
  const selectedID = selected[sourceKey] ?? null;

  const refresh = useCallback(async () => {
    if (mode === "portal") {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const next = await command<CaptureSource[]>({ type: "listSources", mode });
      setSources(next);
      setSelected((current) => {
        const existing = current[sourceKey];
        const stillAvailable = next.some((source) => source.id === existing);
        return {
          ...current,
          [sourceKey]: stillAvailable ? (existing ?? null) : (next[0]?.id ?? null),
        };
      });
    } catch {
      setLoadError("Screens and windows could not be listed. Try again.");
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [mode, sourceKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canStart = !starting && (mode === "portal" || selectedID !== null);
  const start = () => {
    if (!canStart) {
      return;
    }
    setStarting(true);
    void command({
      type: "startRecording",
      request: { mode, sourceId: mode === "portal" ? null : selectedID },
    }).finally(() => setStarting(false));
  };
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void command({ type: "closeWindow" });
      } else if (
        event.key === "Enter" &&
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        startRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const update = (changes: Partial<AppSnapshot["preferences"]>) =>
    void command({ type: "updatePreferences", changes });

  const failure = recorder.state.kind === "failed" ? recorder.state.message : null;

  return (
    <main className="setup">
      <header className="row row--between">
        <div>
          <h1 className="title">New recording</h1>
          <p className="muted">Choose what you want to share.</p>
        </div>
        <Button onClick={() => void command({ type: "closeWindow" })} variant="ghost">
          Cancel
        </Button>
      </header>

      {portalOnly ? (
        <div className="card portal-card">
          <Icon name="monitor" size={28} />
          <div>
            <p className="strong">Pick a screen or window when you start</p>
            <p className="muted small">
              Your desktop asks which screen or window to share. Screenly records only what you
              choose there.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div aria-label="Capture mode" className="segmented" role="tablist">
            {MODES.map((option) => (
              <button
                aria-selected={mode === option.mode}
                className="segmented__option"
                key={option.mode}
                onClick={() => setMode(option.mode)}
                role="tab"
                type="button"
              >
                <Icon name={option.icon} /> {option.title}
              </button>
            ))}
          </div>

          <section aria-busy={loading} aria-label="Sources" className="card sources">
            {loading ? (
              <p className="sources__empty row">
                <Spinner /> Loading screens and windows…
              </p>
            ) : loadError ? (
              <div className="sources__empty stack stack--sm">
                <Message tone="danger">{loadError}</Message>
                <Button icon="refresh" onClick={() => void refresh()} size="sm">
                  Try again
                </Button>
              </div>
            ) : sources.length === 0 ? (
              <div className="sources__empty stack stack--sm">
                <p className="muted">
                  {mode === "window" ? "No shareable windows are open." : "No screens are available."}
                </p>
                <Button icon="refresh" onClick={() => void refresh()} size="sm">
                  Refresh
                </Button>
              </div>
            ) : (
              <div className="sources__grid" role="listbox" aria-label={mode === "window" ? "Windows" : "Screens"}>
                {sources.map((source) => (
                  <button
                    aria-selected={source.id === selectedID}
                    className="source"
                    key={source.id}
                    onClick={() => setSelected((current) => ({ ...current, [sourceKey]: source.id }))}
                    onDoubleClick={start}
                    role="option"
                    type="button"
                  >
                    <span className="source__thumb">
                      {source.thumbnail ? <img alt="" src={source.thumbnail} /> : <Icon name="window" size={28} />}
                    </span>
                    <span className="source__meta">
                      {source.appIcon ? <img alt="" className="source__icon" src={source.appIcon} /> : null}
                      <span className="truncate" title={source.name}>
                        {source.name}
                      </span>
                    </span>
                    {source.kind === "screen" && source.width && source.height ? (
                      <span className="muted small tabular">
                        {source.width} × {source.height}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="card stack">
        <div className="row row--wrap setup__switches">
          <Switch
            checked={preferences.capturesMicrophone}
            label="Microphone"
            onChange={(value) => update({ capturesMicrophone: value })}
          />
          <Switch
            checked={preferences.capturesSystemAudio}
            label="System audio"
            onChange={(value) => update({ capturesSystemAudio: value })}
          />
          <Switch
            checked={preferences.showsWebcam}
            label="Webcam"
            onChange={(value) => update({ showsWebcam: value })}
          />
        </div>
        {preferences.capturesMicrophone || preferences.showsWebcam ? (
          <div className="grid-2">
            {preferences.capturesMicrophone ? (
              <DeviceSelect
                devices={microphones}
                label="Microphone"
                onChange={(value) => update({ microphoneDeviceID: value })}
                value={preferences.microphoneDeviceID}
              />
            ) : null}
            {preferences.showsWebcam ? (
              <DeviceSelect
                devices={cameras}
                label="Camera"
                onChange={(value) => update({ cameraDeviceID: value })}
                value={preferences.cameraDeviceID}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      {preferences.capturesMicrophone && mediaAccess.microphone === "denied" ? (
        <div className="row row--between">
          <Message tone="danger">Microphone access is turned off for desktop apps.</Message>
          <Button onClick={() => void command({ type: "openPrivacySettings", kind: "microphone" })} size="sm">
            Open microphone settings
          </Button>
        </div>
      ) : null}
      {preferences.showsWebcam && mediaAccess.camera === "denied" ? (
        <div className="row row--between">
          <Message tone="danger">Camera access is turned off for desktop apps.</Message>
          <Button onClick={() => void command({ type: "openPrivacySettings", kind: "camera" })} size="sm">
            Open camera settings
          </Button>
        </div>
      ) : null}
      {failure ? <Message tone="danger">{failure}</Message> : null}

      <footer className="row row--between setup__footer">
        <span className="muted small row">
          <Icon name="keyboard" size={14} /> {snapshot.hotkey.label}
        </span>
        <Button busy={starting} disabled={!canStart} icon="record" onClick={start} size="lg" variant="primary">
          {mode === "area" ? "Select area…" : "Start recording"}
        </Button>
      </footer>
    </main>
  );
}

mount(<RecordingSetup />);
