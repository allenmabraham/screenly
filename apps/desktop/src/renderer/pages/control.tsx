import { useLayoutEffect, useRef } from "react";

import { formatElapsed } from "../../core/recording-state";
import type { AppSnapshot } from "../../shared/ipc";
import { command, useSnapshot } from "../bridge";
import { Button, Icon, LogoMark, Message, Spinner } from "../components";
import { mount } from "../mount";

function ControlCenter() {
  const snapshot = useSnapshot();
  const containerRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      void command({ type: "fitContent", height: element.scrollHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [snapshot === null]);

  if (!snapshot) {
    return null;
  }

  const { state } = snapshot.recorder;
  const isCapturing = state.kind === "recording" || state.kind === "paused";
  const subtitle =
    snapshot.account.isAuthenticated && snapshot.account.activeWorkspaceName
      ? `${snapshot.account.activeWorkspaceName} · ${snapshot.hotkey.label}`
      : `${snapshot.hotkey.label} to record`;

  return (
    <main className={`control control--${snapshot.platform}`} ref={containerRef}>
      <header className="card control__header">
        <LogoMark />
        <div className="control__title">
          <h1>Screenly</h1>
          <p className="muted small truncate">{subtitle}</p>
        </div>
        {isCapturing ? (
          <span className="rec-chip">
            <span aria-hidden="true" className="rec-dot" /> REC
          </span>
        ) : null}
      </header>

      <StateContent snapshot={snapshot} />

      <footer className="control__footer">
        <button className="link-button" onClick={() => void command({ type: "openSettings" })} type="button">
          <Icon name="settings" size={14} /> Settings
        </button>
        <button className="link-button" onClick={() => void command({ type: "quit" })} type="button">
          Quit
        </button>
      </footer>
    </main>
  );
}

function StateContent({ snapshot }: { snapshot: AppSnapshot }) {
  const { state, elapsedSeconds } = snapshot.recorder;

  switch (state.kind) {
    case "idle":
      if (snapshot.account.isServerConfigured) {
        return (
          <div className="stack stack--sm">
            <Button icon="plus" onClick={() => void command({ type: "requestRecording" })} size="lg" variant="primary">
              New recording
            </Button>
            <Button icon="library" onClick={() => void command({ type: "openLibrary" })}>
              Open team library
            </Button>
            {!snapshot.hotkey.registered ? (
              <Message tone="warning">
                {snapshot.hotkey.label} is in use by another app. Choose a different shortcut in Settings.
              </Message>
            ) : null}
          </div>
        );
      }
      if (snapshot.account.isAuthenticating && snapshot.account.hasStoredSession) {
        return <StatusCard busy title="Validating sign-in…" />;
      }
      return (
        <div className="card stack stack--sm">
          <p className="row strong">
            <Icon name="user" /> Sign in to start recording
          </p>
          <p className="muted small">Your workspace determines where recordings are uploaded.</p>
          <Button onClick={() => void command({ type: "openSettings" })} variant="primary">
            Sign in…
          </Button>
        </div>
      );

    case "preparing":
      return <StatusCard busy title="Preparing capture…" />;

    case "countdown":
      return (
        <div className="card row row--between">
          <span>Recording starts in {state.count}…</span>
          <Button onClick={() => void command({ type: "discard" })} size="sm" variant="ghost">
            Cancel
          </Button>
        </div>
      );

    case "recording":
    case "paused":
      return (
        <div className="card row row--between">
          <span className="timer" aria-live="off">
            {formatElapsed(elapsedSeconds)}
          </span>
          <div className="row">
            <Button
              aria-label={state.kind === "paused" ? "Resume" : "Pause"}
              icon={state.kind === "paused" ? "play" : "pause"}
              onClick={() => void command({ type: "pauseOrResume" })}
              title={state.kind === "paused" ? "Resume" : "Pause"}
            />
            <Button
              aria-label="Stop and upload"
              icon="stop"
              onClick={() => void command({ type: "stop" })}
              title="Stop and upload"
              variant="danger"
            />
            <Button
              aria-label="Discard recording"
              icon="trash"
              onClick={() => void command({ type: "discard" })}
              title="Discard recording"
            />
          </div>
        </div>
      );

    case "finishing":
      return <StatusCard busy title="Finalizing recording…" />;

    case "uploading":
      return (
        <div className="card stack stack--sm">
          <div className="row row--between">
            <span className="row">
              <Icon name="upload" /> Uploading
            </span>
            <span className="muted tabular">{Math.round(state.progress * 100)}%</span>
          </div>
          <progress aria-label="Upload progress" className="progress" max={1} value={state.progress} />
          <p className="muted small">The share link is already in your clipboard.</p>
        </div>
      );

    case "uploaded":
      return (
        <div className="card stack stack--sm">
          <p className="row success strong">
            <Icon name="check" /> Link copied
          </p>
          <p className="muted small truncate" title={state.shareURL}>
            {state.shareURL}
          </p>
          <div className="row">
            <Button onClick={() => void command({ type: "openShareURL", url: state.shareURL })} variant="primary">
              Open video
            </Button>
            <Button onClick={() => void command({ type: "reset" })}>Done</Button>
          </div>
        </div>
      );

    case "failed":
      return (
        <div className="card stack stack--sm">
          <p className="row danger strong">
            <Icon name="alert" /> Something went wrong
          </p>
          <p className="muted small">{state.message}</p>
          <div className="row">
            <Button onClick={() => void command({ type: "retryUpload" })} variant="primary">
              Retry upload
            </Button>
            <Button onClick={() => void command({ type: "reset" })}>Dismiss</Button>
          </div>
        </div>
      );
  }
}

function StatusCard({ title, busy }: { title: string; busy?: boolean }) {
  return (
    <div className="card row" role="status">
      {busy ? <Spinner /> : null}
      <span>{title}</span>
    </div>
  );
}

mount(<ControlCenter />);
