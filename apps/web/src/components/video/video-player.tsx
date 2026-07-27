"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  GaugeIcon,
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PipIcon,
  PlayIcon,
  ReplayIcon,
  VolumeIcon,
  VolumeOffIcon,
  XIcon,
} from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { formatDuration } from "@/lib/format";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const RATE_STORAGE_KEY = "screenly-playback-rate";
const POSITION_STORAGE_PREFIX = "screenly:position:";
const CONTROLS_IDLE_MS = 2_600;
const SEEK_SMALL = 5;
const SEEK_LARGE = 10;
/** Only offer to resume between these bounds so it never feels arbitrary. */
const RESUME_MIN_SECONDS = 15;
const RESUME_MAX_FRACTION = 0.9;

type VideoPlayerProps = {
  slug: string;
  title: string;
  videoUrl: string;
  posterUrl: string | null;
  durationSeconds: number | null;
};

function readStoredRate() {
  if (typeof window === "undefined") {
    return 1;
  }
  try {
    const stored = Number(window.localStorage.getItem(RATE_STORAGE_KEY));
    return PLAYBACK_RATES.includes(stored as (typeof PLAYBACK_RATES)[number])
      ? stored
      : 1;
  } catch {
    return 1;
  }
}

function readStoredPosition(slug: string) {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = Number(
      window.localStorage.getItem(`${POSITION_STORAGE_PREFIX}${slug}`),
    );
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

/**
 * "Has this component hydrated?" without setting state inside an effect: the
 * server snapshot is false and the client snapshot is true, so the value flips
 * once after hydration and never changes again.
 */
const hydrationStore = {
  subscribe: () => () => {},
  getSnapshot: () => true,
  getServerSnapshot: () => false,
};

export function VideoPlayer({
  slug,
  title,
  videoUrl,
  posterUrl,
  durationSeconds,
}: VideoPlayerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const bufferedRef = useRef<HTMLDivElement>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<number | null>(null);
  const isScrubbingRef = useRef(false);
  const seekLabelId = useId();

  /**
   * Progressive enhancement: the server renders a plain `<video controls>` so
   * the player works without JavaScript (and inside embeds). Once hydrated, the
   * native controls are swapped for the custom bar below.
   */
  const isEnhanced = useSyncExternalStore(
    hydrationStore.subscribe,
    hydrationStore.getSnapshot,
    hydrationStore.getServerSnapshot,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(readStoredRate);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  // Whole seconds only: the timecode re-renders at most once per second while
  // the progress bar itself is updated from a rAF loop without re-rendering.
  const [currentSecond, setCurrentSecond] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Read once on mount; the chip is only rendered after hydration, so this
  // cannot cause a hydration mismatch.
  const [storedPosition] = useState(() => readStoredPosition(slug));
  const [resumeDismissed, setResumeDismissed] = useState(false);

  const supportsPip =
    isEnhanced &&
    "pictureInPictureEnabled" in document &&
    document.pictureInPictureEnabled;

  const resumeFrom =
    !resumeDismissed &&
    storedPosition !== null &&
    storedPosition > RESUME_MIN_SECONDS &&
    (!durationSeconds || storedPosition < durationSeconds * RESUME_MAX_FRACTION)
      ? storedPosition
      : null;

  /** Writes progress geometry straight to the DOM — no React render per frame. */
  const paint = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const total = video.duration || durationSeconds || 0;
    const fraction = total > 0 ? Math.min(1, video.currentTime / total) : 0;
    if (progressRef.current) {
      progressRef.current.style.transform = `scaleX(${fraction})`;
    }
    if (seekRef.current && !isScrubbingRef.current) {
      seekRef.current.value = String(Math.floor(video.currentTime));
    }
    if (bufferedRef.current && video.buffered.length > 0 && total > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      bufferedRef.current.style.transform = `scaleX(${Math.min(1, bufferedEnd / total)})`;
    }
  }, [durationSeconds]);

  // The animation loop runs only while playing and only while the tab is
  // visible, so a backgrounded viewer page costs nothing.
  useEffect(() => {
    if (!isEnhanced) {
      return;
    }

    function stop() {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    }

    function loop() {
      paint();
      const video = videoRef.current;
      const second = Math.floor(video?.currentTime ?? 0);
      setCurrentSecond((previous) => (previous === second ? previous : second));
      frameRef.current = requestAnimationFrame(loop);
    }

    if (isPlaying && !document.hidden) {
      frameRef.current = requestAnimationFrame(loop);
    } else {
      paint();
    }

    function onVisibilityChange() {
      if (document.hidden) {
        stop();
      } else if (isPlaying && frameRef.current === null) {
        frameRef.current = requestAnimationFrame(loop);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isEnhanced, isPlaying, paint]);

  // Push the remembered playback rate onto the media element.
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = rate;
    }
  }, [rate]);

  const rememberPosition = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    try {
      const key = `${POSITION_STORAGE_PREFIX}${slug}`;
      if (video.currentTime > RESUME_MIN_SECONDS && !video.ended) {
        window.localStorage.setItem(key, String(Math.floor(video.currentTime)));
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage failures.
    }
  }, [slug]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const onPause = () => {
      setIsPlaying(false);
      rememberPosition();
    };
    document.addEventListener("visibilitychange", rememberPosition);
    video.addEventListener("pause", onPause);
    window.addEventListener("pagehide", rememberPosition);
    return () => {
      document.removeEventListener("visibilitychange", rememberPosition);
      video.removeEventListener("pause", onPause);
      window.removeEventListener("pagehide", rememberPosition);
      rememberPosition();
    };
  }, [rememberPosition]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, CONTROLS_IDLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    },
    [],
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused || video.ended) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
    showControls();
  }, [showControls]);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      const total = video.duration || durationSeconds || 0;
      video.currentTime = Math.max(
        0,
        Math.min(total || video.currentTime, video.currentTime + deltaSeconds),
      );
      paint();
      showControls();
    },
    [durationSeconds, paint, showControls],
  );

  const changeVolume = useCallback(
    (next: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      const clamped = Math.max(0, Math.min(1, next));
      video.volume = clamped;
      video.muted = clamped === 0;
      setVolume(clamped);
      setIsMuted(clamped === 0);
      showControls();
    },
    [showControls],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const next = !video.muted;
    video.muted = next;
    setIsMuted(next);
    showControls();
  }, [showControls]);

  const changeRate = useCallback((next: number) => {
    setRate(next);
    try {
      window.localStorage.setItem(RATE_STORAGE_KEY, String(next));
    } catch {
      // Persisting the rate is optional.
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void stageRef.current?.requestFullscreen().catch(() => {});
    }
  }, []);

  const togglePip = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => {});
    } else {
      void video.requestPictureInPicture?.().catch(() => {});
    }
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    // Never hijack typing, or the range input's own arrow-key handling.
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }

    const { key } = event;
    if (key === " " || key === "k" || key === "K") {
      event.preventDefault();
      togglePlay();
    } else if (key === "ArrowRight") {
      event.preventDefault();
      seekBy(SEEK_SMALL);
    } else if (key === "ArrowLeft") {
      event.preventDefault();
      seekBy(-SEEK_SMALL);
    } else if (key === "l" || key === "L") {
      seekBy(SEEK_LARGE);
    } else if (key === "j" || key === "J") {
      seekBy(-SEEK_LARGE);
    } else if (key === "ArrowUp") {
      event.preventDefault();
      changeVolume(volume + 0.1);
    } else if (key === "ArrowDown") {
      event.preventDefault();
      changeVolume(volume - 0.1);
    } else if (key === "m" || key === "M") {
      toggleMute();
    } else if (key === "f" || key === "F") {
      toggleFullscreen();
    } else if (key === ">" || key === ".") {
      const index = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
      changeRate(PLAYBACK_RATES[Math.min(PLAYBACK_RATES.length - 1, index + 1)]!);
    } else if (key === "<" || key === ",") {
      const index = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
      changeRate(PLAYBACK_RATES[Math.max(0, index - 1)]!);
    } else if (/^[0-9]$/.test(key)) {
      const video = videoRef.current;
      const total = video?.duration || durationSeconds || 0;
      if (video && total > 0) {
        video.currentTime = (total * Number(key)) / 10;
        paint();
        showControls();
      }
    }
  }

  function onSeekInput(event: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.currentTime = Number(event.target.value);
    setCurrentSecond(Math.floor(video.currentTime));
    paint();
  }

  function onSeekPointerDown() {
    isScrubbingRef.current = true;
  }

  function onSeekPointerUp() {
    isScrubbingRef.current = false;
  }

  function resume() {
    const video = videoRef.current;
    if (video && resumeFrom !== null) {
      video.currentTime = resumeFrom;
      paint();
      void video.play().catch(() => {});
    }
    setResumeDismissed(true);
  }

  function dismissResume() {
    setResumeDismissed(true);
    try {
      window.localStorage.removeItem(`${POSITION_STORAGE_PREFIX}${slug}`);
    } catch {
      // Ignore storage failures.
    }
  }

  const total = duration || durationSeconds || 0;
  const PlayGlyph = hasEnded ? ReplayIcon : isPlaying ? PauseIcon : PlayIcon;

  return (
    <div
      className={[
        "player",
        isEnhanced ? "player--enhanced" : null,
        controlsVisible || !isPlaying ? "is-showing-controls" : null,
        isPlaying ? "is-playing" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onKeyDown={isEnhanced ? onKeyDown : undefined}
      onPointerMove={isEnhanced ? showControls : undefined}
      ref={stageRef}
      // The stage owns keyboard shortcuts, so it must be focusable and named.
      {...(isEnhanced
        ? { tabIndex: 0, role: "region", "aria-label": `Video player: ${title}` }
        : {})}
    >
      <video
        aria-label={title}
        className="player__video"
        controls={!isEnhanced}
        onClick={isEnhanced ? togglePlay : undefined}
        onDoubleClick={isEnhanced ? toggleFullscreen : undefined}
        onDurationChange={(event) =>
          setDuration(event.currentTarget.duration || 0)
        }
        onEnded={() => {
          setHasEnded(true);
          setIsPlaying(false);
          setControlsVisible(true);
        }}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          setVolume(event.currentTarget.volume);
          setIsMuted(event.currentTarget.muted);
          paint();
        }}
        onPause={() => setControlsVisible(true)}
        onPlay={() => {
          setHasEnded(false);
          setIsPlaying(true);
          showControls();
        }}
        onProgress={paint}
        onSeeked={paint}
        playsInline
        poster={posterUrl ?? undefined}
        preload="metadata"
        ref={videoRef}
        src={videoUrl}
      />

      {isEnhanced ? (
        <>
          {!isPlaying ? (
            <button
              aria-label={hasEnded ? "Replay" : "Play"}
              className="player__overlay-play"
              onClick={togglePlay}
              type="button"
            >
              <PlayGlyph size={28} />
            </button>
          ) : null}

          {resumeFrom !== null ? (
            <div className="player__resume" role="status">
              <span>Resume at {formatDuration(resumeFrom)}?</span>
              <button className="player__resume-action" onClick={resume} type="button">
                Resume
              </button>
              <button
                aria-label="Start from the beginning"
                className="player__resume-dismiss"
                onClick={dismissResume}
                type="button"
              >
                <XIcon size={14} />
              </button>
            </div>
          ) : null}

          <div className="player__controls">
            <div className="player__scrubber">
              <div aria-hidden="true" className="player__track">
                <div className="player__buffered" ref={bufferedRef} />
                <div className="player__progress" ref={progressRef} />
              </div>
              <span className="sr-only" id={seekLabelId}>
                Seek through {title}
              </span>
              <input
                aria-labelledby={seekLabelId}
                aria-valuetext={`${formatDuration(currentSecond)} of ${formatDuration(total)}`}
                className="player__seek"
                max={Math.max(1, Math.floor(total))}
                min={0}
                onChange={onSeekInput}
                onPointerDown={onSeekPointerDown}
                onPointerUp={onSeekPointerUp}
                ref={seekRef}
                step={1}
                type="range"
              />
            </div>

            <div className="player__buttons">
              <button
                aria-label={hasEnded ? "Replay" : isPlaying ? "Pause" : "Play"}
                className="player__button"
                onClick={togglePlay}
                type="button"
              >
                <PlayGlyph size={19} />
              </button>

              <div className="player__volume">
                <button
                  aria-label={isMuted ? "Unmute" : "Mute"}
                  className="player__button"
                  onClick={toggleMute}
                  type="button"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeOffIcon size={18} />
                  ) : (
                    <VolumeIcon size={18} />
                  )}
                </button>
                <input
                  aria-label="Volume"
                  className="player__volume-slider"
                  max={1}
                  min={0}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  step={0.05}
                  type="range"
                  value={isMuted ? 0 : volume}
                />
              </div>

              <span className="player__time tabular">
                {formatDuration(currentSecond)}
                <span className="player__time-separator"> / </span>
                {formatDuration(total)}
              </span>

              <div className="player__spacer" />

              <Menu
                align="end"
                label={
                  <>
                    <GaugeIcon size={17} />
                    <span className="tabular">{rate}×</span>
                  </>
                }
                panelClassName="menu__panel--compact"
                side="above"
                triggerClassName="player__button player__button--wide"
                triggerLabel="Playback speed"
              >
                {(close) => (
                  <>
                    <p className="menu__label">Playback speed</p>
                    {PLAYBACK_RATES.map((option) => (
                      <button
                        aria-checked={rate === option}
                        className="menu__item"
                        key={option}
                        onClick={() => {
                          changeRate(option);
                          close();
                        }}
                        role="menuitemradio"
                        type="button"
                      >
                        <span className="tabular">{option}×</span>
                        {option === 1 ? (
                          <span className="menu__item__trailing">Normal</span>
                        ) : null}
                      </button>
                    ))}
                  </>
                )}
              </Menu>

              {supportsPip ? (
                <button
                  aria-label="Picture in picture"
                  className="player__button"
                  onClick={togglePip}
                  type="button"
                >
                  <PipIcon size={18} />
                </button>
              ) : null}

              <button
                aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
                className="player__button"
                onClick={toggleFullscreen}
                type="button"
              >
                {isFullscreen ? (
                  <MinimizeIcon size={18} />
                ) : (
                  <MaximizeIcon size={18} />
                )}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
