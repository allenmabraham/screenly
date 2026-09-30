import { formatElapsed } from "../../core/recording-state";
import { command, useSnapshot } from "../bridge";
import { Icon } from "../components";
import { mount } from "../mount";

function RecordingHUD() {
  const snapshot = useSnapshot();
  if (!snapshot) {
    return null;
  }
  const { state, elapsedSeconds } = snapshot.recorder;

  if (state.kind === "countdown") {
    return (
      <main className="hud hud--countdown" aria-live="assertive">
        <span className="hud__count">{state.count}</span>
        <span className="hud__label">Recording starts…</span>
        <button
          aria-label="Cancel recording"
          className="hud__button"
          onClick={() => void command({ type: "discard" })}
          title="Cancel"
          type="button"
        >
          <Icon name="close" />
        </button>
      </main>
    );
  }

  const paused = state.kind === "paused";
  return (
    <main className="hud">
      <span className={`hud__dot${paused ? " hud__dot--paused" : ""}`} aria-hidden="true" />
      <span className="hud__time tabular">{formatElapsed(elapsedSeconds)}</span>
      <span className="hud__spacer" />
      <button
        aria-label={paused ? "Resume" : "Pause"}
        className="hud__button"
        onClick={() => void command({ type: "pauseOrResume" })}
        title={paused ? "Resume" : "Pause"}
        type="button"
      >
        <Icon name={paused ? "play" : "pause"} />
      </button>
      <button
        aria-label="Stop and upload"
        className="hud__button hud__button--stop"
        onClick={() => void command({ type: "stop" })}
        title="Stop and upload"
        type="button"
      >
        <Icon name="stop" />
      </button>
      <button
        aria-label="Discard recording"
        className="hud__button"
        onClick={() => void command({ type: "discard" })}
        title="Discard recording"
        type="button"
      >
        <Icon name="trash" />
      </button>
    </main>
  );
}

mount(<RecordingHUD />);
