"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CheckIcon, ClockIcon } from "@/components/ui/icons";
import type { PublicProcessingState } from "@/features/videos/video-service";
import {
  formatProcessingEta,
  isProcessingHeartbeatStale,
  processingStageLabel,
} from "@/lib/format-processing";

type ProcessingStateProps = {
  slug: string;
  status: "uploading" | "processing";
  initialProcessing: PublicProcessingState | null;
};

type VideoStatusResponse = {
  status: "uploading" | "processing" | "ready" | "failed";
  processing: PublicProcessingState | null;
};

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_INTERVAL_MS = 10_000;

/** The pipeline the viewer is waiting on, in the order the worker runs it. */
const STEPS: Array<{ id: string; label: string; stages: string[] }> = [
  { id: "upload", label: "Upload", stages: [] },
  {
    id: "transcode",
    label: "Optimize",
    stages: ["downloading", "inspecting", "transcoding", "uploading_playback"],
  },
  {
    id: "preview",
    label: "Preview",
    stages: ["generating_preview", "uploading_assets", "packaging_hls"],
  },
  { id: "ready", label: "Ready", stages: ["finalizing"] },
];

function stepState(
  stepIndex: number,
  stage: string | null,
  status: "uploading" | "processing",
) {
  if (status === "uploading") {
    return stepIndex === 0 ? "active" : "pending";
  }
  if (stage === null || stage === "queued") {
    return stepIndex === 0 ? "done" : "pending";
  }

  const activeIndex = STEPS.findIndex((step) => step.stages.includes(stage));
  const resolvedIndex = activeIndex === -1 ? 1 : activeIndex;
  if (stepIndex < resolvedIndex) {
    return "done";
  }
  return stepIndex === resolvedIndex ? "active" : "pending";
}

export function ProcessingState({
  slug,
  status,
  initialProcessing,
}: ProcessingStateProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [processing, setProcessing] = useState(initialProcessing);
  const [clock, setClock] = useState(0);
  const [etaUpdatedAt, setEtaUpdatedAt] = useState(0);
  const failureCountRef = useRef(0);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let tickTimer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    const controller = new AbortController();

    async function poll() {
      try {
        const response = await fetch(
          `/api/videos/${encodeURIComponent(slug)}`,
          { cache: "no-store", signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const video = (await response.json()) as VideoStatusResponse;
        failureCountRef.current = 0;

        if (video.status === "ready" || video.status === "failed") {
          router.refresh();
          return;
        }

        setCurrentStatus(video.status);
        setProcessing(video.processing);
        const receivedAt = Date.now();
        setClock(receivedAt);
        setEtaUpdatedAt(receivedAt);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        // Back off on repeated failures instead of hammering a struggling API.
        failureCountRef.current = Math.min(4, failureCountRef.current + 1);
      } finally {
        if (!cancelled && !document.hidden) {
          schedule();
        }
      }
    }

    function schedule() {
      const delay = Math.min(
        MAX_POLL_INTERVAL_MS,
        POLL_INTERVAL_MS * 2 ** failureCountRef.current,
      );
      pollTimer = setTimeout(poll, delay);
    }

    function start() {
      tickTimer = setInterval(() => setClock(Date.now()), 1_000);
      schedule();
    }

    function stop() {
      if (pollTimer) clearTimeout(pollTimer);
      if (tickTimer) clearInterval(tickTimer);
      pollTimer = undefined;
      tickTimer = undefined;
    }

    // A hidden tab costs nothing: neither the poll nor the clock runs, and a
    // fresh state is fetched immediately when the viewer comes back.
    function onVisibilityChange() {
      if (document.hidden) {
        stop();
      } else if (!pollTimer) {
        start();
        void poll();
      }
    }

    if (!document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      controller.abort();
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, slug]);

  const progressPercent = processing?.progressPercent;
  const stage = processing?.stage ?? null;
  const heartbeatIsStale =
    clock > 0 &&
    isProcessingHeartbeatStale(processing?.heartbeatAt ?? null, clock);
  const elapsedSinceEtaUpdate =
    clock > 0 && etaUpdatedAt > 0 ? (clock - etaUpdatedAt) / 1_000 : 0;
  const remainingSeconds =
    processing?.etaSeconds === null || processing?.etaSeconds === undefined
      ? null
      : Math.max(0, processing.etaSeconds - elapsedSinceEtaUpdate);

  const isUploading = currentStatus === "uploading";
  const heading = isUploading
    ? "Uploading recording"
    : processingStageLabel(stage);
  const detail = isUploading
    ? "The recording is still being uploaded. This page will update automatically."
    : heartbeatIsStale
      ? "Processor update delayed. We’ll keep checking automatically."
      : stage === null || stage === "queued"
        ? "Your recording is uploaded and waiting for the processor to start."
        : remainingSeconds === null
          ? "Measuring processing speed to estimate the remaining time."
          : formatProcessingEta(remainingSeconds);

  const showPercent = !isUploading && progressPercent !== null && progressPercent !== undefined;

  return (
    <div className="processing" role="status">
      <div className="processing__header">
        <span
          className={`processing__pulse${heartbeatIsStale ? " is-stale" : ""}`}
          aria-hidden="true"
        />
        <div>
          <p className="processing__title">{heading}</p>
          <p className="processing__detail">{detail}</p>
        </div>
        {showPercent ? (
          <strong className="processing__percent tabular">
            {progressPercent}%
          </strong>
        ) : (
          <span className="processing__waiting">
            <ClockIcon size={14} />
            {isUploading ? "Uploading" : "Estimating time"}
          </span>
        )}
      </div>

      <div
        aria-label="Video processing progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progressPercent ?? undefined}
        className={`processing__track${showPercent ? "" : " is-indeterminate"}`}
        role="progressbar"
      >
        <span style={showPercent ? { width: `${progressPercent}%` } : undefined} />
      </div>

      <ol className="processing__steps">
        {STEPS.map((step, index) => {
          const state = stepState(index, stage, currentStatus);
          return (
            <li className={`processing__step is-${state}`} key={step.id}>
              <span className="processing__step-marker">
                {state === "done" ? <CheckIcon size={12} /> : null}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>

      <p className="processing__note">
        Playback starts automatically when processing finishes.
      </p>
    </div>
  );
}
