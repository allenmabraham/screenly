import { useEffect, useRef, useState } from "react";

import { command } from "../bridge";
import { Icon, Spinner } from "../components";
import { mount } from "../mount";

const params = new URLSearchParams(window.location.search);
const cameraDeviceId = params.get("camera") || null;
const mirrored = params.get("mirrored") === "1";

function WebcamBubble() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const open = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(cameraDeviceId ? { deviceId: { exact: cameraDeviceId } } : {}),
            width: { ideal: 640 },
            height: { ideal: 640 },
            frameRate: { ideal: 30 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices
          .getUserMedia({ audio: false, video: true })
          .catch(() => null);
      }
      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!stream || !videoRef.current) {
        setFailed(true);
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
      setReady(true);
    };
    void open();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <main
      className="webcam"
      onWheel={(event) => void command({ type: "resizeWebcam", step: event.deltaY < 0 ? 1 : -1 })}
    >
      <video
        className={`webcam__video${mirrored ? " webcam__video--mirrored" : ""}`}
        muted
        playsInline
        ref={videoRef}
      />
      {!ready ? (
        <span className="webcam__status">
          {failed ? <Icon name="alert" size={22} /> : <Spinner />}
        </span>
      ) : null}
      <span className="webcam__controls">
        <button
          aria-label="Smaller camera"
          className="webcam__button"
          onClick={() => void command({ type: "resizeWebcam", step: -1 })}
          type="button"
        >
          <Icon name="minus" size={14} />
        </button>
        <button
          aria-label="Larger camera"
          className="webcam__button"
          onClick={() => void command({ type: "resizeWebcam", step: 1 })}
          type="button"
        >
          <Icon name="plus" size={14} />
        </button>
      </span>
    </main>
  );
}

mount(<WebcamBubble />);
