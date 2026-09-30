import { command, useSnapshot } from "../bridge";
import { AuthenticationPanel, Button, Icon, LogoMark } from "../components";
import { mount } from "../mount";

function Onboarding() {
  const snapshot = useSnapshot();
  if (!snapshot) {
    return null;
  }
  const { account, mediaAccess, platform } = snapshot;
  const canFinish = account.isServerConfigured && !account.isAuthenticating;

  return (
    <main className="onboarding">
      <header className="stack stack--sm">
        <LogoMark size={52} />
        <h1 className="display">Set up Screenly</h1>
        <p className="muted">
          Sign in to your workspace. Then every recording is only a shortcut away: press{" "}
          <kbd>{snapshot.hotkey.label}</kbd> or use the tray icon.
        </p>
      </header>

      <section className="card stack">
        <h2 className="section-title">Screenly account</h2>
        <AuthenticationPanel snapshot={snapshot} />
      </section>

      <section aria-label="Capture access" className="card access-list">
        <AccessItem
          detail={
            snapshot.isWayland
              ? "Your desktop asks which screen or window to share each time you record."
              : "Capture any display, a single window, or an area you drag out."
          }
          granted
          title="Screen recording"
        />
        <AccessItem
          action={
            platform === "win32" && mediaAccess.microphone === "denied"
              ? () => void command({ type: "openPrivacySettings", kind: "microphone" })
              : undefined
          }
          detail={
            platform === "win32" && mediaAccess.microphone === "denied"
              ? "Blocked for desktop apps in Windows Settings."
              : "Used when microphone audio is enabled."
          }
          granted={mediaAccess.microphone !== "denied"}
          title="Microphone"
        />
        <AccessItem
          action={
            platform === "win32" && mediaAccess.camera === "denied"
              ? () => void command({ type: "openPrivacySettings", kind: "camera" })
              : undefined
          }
          detail={
            platform === "win32" && mediaAccess.camera === "denied"
              ? "Blocked for desktop apps in Windows Settings."
              : "Optional, for the webcam bubble."
          }
          granted={mediaAccess.camera !== "denied"}
          title="Camera"
        />
      </section>

      <footer className="row row--between">
        <span className="muted small row">
          <Icon name="keyboard" size={14} /> Default shortcut: {snapshot.hotkey.label}
        </span>
        <Button
          disabled={!canFinish}
          onClick={() => void command({ type: "completeOnboarding" })}
          size="lg"
          variant="primary"
        >
          Finish setup
        </Button>
      </footer>
    </main>
  );
}

function AccessItem({
  title,
  detail,
  granted,
  action,
}: {
  title: string;
  detail: string;
  granted: boolean;
  action?: () => void;
}) {
  return (
    <div className="row row--between access-item">
      <span className="row">
        <span className={granted ? "success" : "warning"}>
          <Icon name={granted ? "check" : "alert"} size={20} />
        </span>
        <span className="stack stack--xs">
          <span className="strong">{title}</span>
          <span className="muted small">{detail}</span>
        </span>
      </span>
      {action ? (
        <Button onClick={action} size="sm">
          Open settings
        </Button>
      ) : null}
    </div>
  );
}

mount(<Onboarding />);
