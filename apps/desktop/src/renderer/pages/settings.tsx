import { type ReactNode, useEffect, useId, useState } from "react";

import { HOTKEY_CHOICES, hotkeyLabel } from "../../core/hotkeys";
import type { AppSnapshot, ManualConfiguration, MediaAccess } from "../../shared/ipc";
import { command, useMediaDevices, useSnapshot } from "../bridge";
import {
  AuthenticationPanel,
  Button,
  DeviceSelect,
  Icon,
  type IconName,
  Message,
  Switch,
} from "../components";
import { mount } from "../mount";

function SettingsPage() {
  const snapshot = useSnapshot();
  if (!snapshot) {
    return null;
  }
  return <SettingsForm snapshot={snapshot} />;
}

function SettingsForm({ snapshot }: { snapshot: AppSnapshot }) {
  const { preferences, account } = snapshot;
  const microphones = useMediaDevices("audioinput", preferences.capturesMicrophone);
  const cameras = useMediaDevices("videoinput", preferences.showsWebcam);
  const nameId = useId();
  const [recorderName, setRecorderName] = useState(preferences.recorderName);

  const update = (changes: Partial<AppSnapshot["preferences"]>) =>
    void command({ type: "updatePreferences", changes });

  return (
    <main className="settings">
      <h1 className="title">Settings</h1>

      <Section icon="user" title="Account & workspace">
        <AuthenticationPanel snapshot={snapshot} />
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            Your display name
          </label>
          <input
            className="input"
            id={nameId}
            maxLength={120}
            onBlur={() => update({ recorderName })}
            onChange={(event) => setRecorderName(event.target.value)}
            value={recorderName}
          />
        </div>
        {snapshot.secretStorage === "weak" ? (
          <Message tone="warning">
            No system keyring is available, so your sign-in is stored with basic protection. Install
            GNOME Keyring or KWallet for encrypted storage.
          </Message>
        ) : null}
      </Section>

      <Section icon="record" title="Recording defaults">
        <div className="stack stack--sm">
          <Switch
            checked={preferences.capturesSystemAudio}
            label="Capture system audio"
            onChange={(value) => update({ capturesSystemAudio: value })}
          />
          <Switch
            checked={preferences.capturesMicrophone}
            label="Capture microphone"
            onChange={(value) => update({ capturesMicrophone: value })}
          />
          <Switch
            checked={preferences.showsWebcam}
            label="Show webcam bubble"
            onChange={(value) => update({ showsWebcam: value })}
          />
        </div>
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
        {snapshot.platform === "linux" ? (
          <p className="muted small">
            System audio is recorded from your default output through PulseAudio or PipeWire.
          </p>
        ) : null}
      </Section>

      <Section icon="keyboard" title="Keyboard shortcut">
        <div aria-label="Start recording" className="segmented" role="radiogroup">
          {HOTKEY_CHOICES.map((choice) => (
            <button
              aria-checked={preferences.hotkey === choice}
              className="segmented__option"
              key={choice}
              onClick={() => update({ hotkey: choice })}
              role="radio"
              type="button"
            >
              {hotkeyLabel(choice)}
            </button>
          ))}
        </div>
        {!snapshot.hotkey.registered ? (
          <Message tone="warning">
            {snapshot.hotkey.label} could not be registered. Another app may be using it
            {snapshot.isWayland ? ", or your desktop does not support global shortcuts" : ""}.
          </Message>
        ) : null}
      </Section>

      {snapshot.platform === "win32" ? (
        <Section icon="shield" title="Privacy">
          <AccessRow
            kind="microphone"
            label="Microphone"
            status={snapshot.mediaAccess.microphone}
          />
          <AccessRow kind="camera" label="Camera" status={snapshot.mediaAccess.camera} />
          <p className="muted small">
            Screen recording does not need a Windows permission. Screenly&apos;s own controls are
            hidden from your recordings.
          </p>
        </Section>
      ) : null}

      <Section icon="settings" title="Advanced">
        <ManualConfigurationForm canChange={account.canChangeAuthentication} />
      </Section>

      <p className="muted small settings__version">Screenly {snapshot.version}</p>
    </main>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card stack">
      <h2 className="section-title row" id={id}>
        <Icon name={icon} /> {title}
      </h2>
      {children}
    </section>
  );
}

function AccessRow({
  kind,
  label,
  status,
}: {
  kind: "microphone" | "camera";
  label: string;
  status: MediaAccess;
}) {
  const allowed = status === "granted";
  return (
    <div className="row row--between">
      <span>{label}</span>
      <span className="row">
        <span className={`row small ${allowed ? "success" : "warning"}`}>
          <Icon name={allowed ? "check" : "alert"} size={14} />
          {allowed ? "Allowed" : status === "denied" ? "Blocked" : "Not determined"}
        </span>
        {!allowed ? (
          <Button onClick={() => void command({ type: "openPrivacySettings", kind })} size="sm">
            Open settings
          </Button>
        ) : null}
      </span>
    </div>
  );
}

function ManualConfigurationForm({ canChange }: { canChange: boolean }) {
  const [open, setOpen] = useState(false);
  const [serverURL, setServerURL] = useState("");
  const [apiToken, setAPIToken] = useState("");
  const serverId = useId();
  const tokenId = useId();

  useEffect(() => {
    void command<ManualConfiguration>({ type: "getManualConfiguration" }).then((value) => {
      setServerURL(value.serverURL);
      setAPIToken(value.apiToken);
    });
  }, []);

  return (
    <details className="disclosure" onToggle={(event) => setOpen(event.currentTarget.open)} open={open}>
      <summary>Manual server configuration</summary>
      <div className="stack stack--sm disclosure__body">
        <div className="field">
          <label className="field__label" htmlFor={serverId}>
            Server URL
          </label>
          <input
            className="input"
            id={serverId}
            onChange={(event) => setServerURL(event.target.value)}
            placeholder="https://video.example.com"
            value={serverURL}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={tokenId}>
            Recorder token
          </label>
          <input
            className="input"
            id={tokenId}
            onChange={(event) => setAPIToken(event.target.value)}
            type="password"
            value={apiToken}
          />
        </div>
        <p className="muted small">
          For local or self-hosted servers. Applying this configuration signs out the current
          Screenly account.
        </p>
        <div className="row row--end">
          <Button
            disabled={!serverURL || !apiToken || !canChange}
            onClick={() =>
              void command({ type: "useManualConfiguration", serverURL, apiToken })
            }
          >
            Use manual configuration
          </Button>
        </div>
      </div>
    </details>
  );
}

mount(<SettingsPage />);
