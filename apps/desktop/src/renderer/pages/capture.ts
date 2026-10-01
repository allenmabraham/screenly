import {
  FRAME_RATE,
  type Rect,
  type Size,
  chooseRecordingFormat,
  fitForH264,
  regionToFrameRect,
  videoBitrate,
  webcamCircle,
} from "../../core/capture-geometry";
import type {
  CaptureCommand,
  CapturePrepared,
  CaptureStartConfig,
} from "../../shared/ipc";

type Session = {
  streams: MediaStream[];
  audioContext: AudioContext | null;
  recorder: MediaRecorder;
  compositor: Compositor | null;
  chunkQueue: Promise<void>;
  stopped: Promise<void>;
  cancelled: boolean;
};

let session: Session | null = null;
const bridge = window.screenlyCapture;

bridge.onCommand(({ id, command }) => {
  void handle(command).then(
    (value) => bridge.reply({ id, ok: true, value: value ?? null }),
    (error: unknown) =>
      bridge.reply({
        id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }),
  );
});

async function handle(command: CaptureCommand): Promise<unknown> {
  switch (command.type) {
    case "prepare":
      return prepare(command.config);
    case "start":
      requireSession().recorder.start(1_000);
      return null;
    case "pause":
      if (requireSession().recorder.state === "recording") {
        requireSession().recorder.pause();
      }
      return null;
    case "resume":
      if (requireSession().recorder.state === "paused") {
        requireSession().recorder.resume();
      }
      return null;
    case "stop":
      return stop();
    case "cancel":
      cancel();
      return null;
    case "webcamFrame":
      session?.compositor?.setWebcamFrame(command.frame);
      return null;
  }
}

function requireSession() {
  if (!session) {
    throw new Error("The recording encoder was not started.");
  }
  return session;
}

async function prepare(config: CaptureStartConfig): Promise<CapturePrepared> {
  cancel();
  const streams: MediaStream[] = [];
  const release = () => {
    for (const stream of streams) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  try {
    const format = chooseRecordingFormat((type) => MediaRecorder.isTypeSupported(type));
    if (!format) {
      throw new Error("This computer cannot encode screen recordings.");
    }

    const screen = await openScreen(config);
    streams.push(screen);
    const screenTrack = screen.getVideoTracks()[0];
    if (!screenTrack) {
      throw new Error("The selected screen or window is no longer available.");
    }

    const audioSources: MediaStream[] = [];
    if (config.systemAudio && screen.getAudioTracks().length > 0) {
      audioSources.push(new MediaStream(screen.getAudioTracks()));
    }
    if (config.microphone) {
      const microphone = await openMicrophone(config.microphone.deviceId);
      streams.push(microphone);
      audioSources.push(microphone);
    }

    let camera: MediaStream | null = null;
    if (config.camera?.composite) {
      camera = await openCamera(config.camera.deviceId);
      streams.push(camera);
    }

    let videoTrack: MediaStreamTrack = screenTrack;
    let compositor: Compositor | null = null;
    let size = trackSize(screenTrack, config.requestedSize);
    if (config.crop || camera) {
      compositor = await Compositor.create(screenTrack, camera, config);
      videoTrack = compositor.track;
      size = compositor.size;
    }

    const { track: audioTrack, context: audioContext } = mixAudio(audioSources);
    const output = new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])]);
    const recorder = new MediaRecorder(output, {
      mimeType: format.mimeType,
      videoBitsPerSecond: videoBitrate(size),
      audioBitsPerSecond: 160_000,
    });

    const next: Session = {
      streams,
      audioContext,
      recorder,
      compositor,
      chunkQueue: Promise.resolve(),
      stopped: Promise.resolve(),
      cancelled: false,
    };
    next.stopped = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    recorder.addEventListener("dataavailable", (event) => {
      if (next.cancelled || event.data.size === 0) {
        return;
      }
      const data = event.data;
      next.chunkQueue = next.chunkQueue.then(async () => {
        if (!next.cancelled) {
          await bridge.writeChunk(await data.arrayBuffer());
        }
      });
    });
    recorder.addEventListener("error", (event) => {
      const message = (event as ErrorEvent).message || "The recording could not be encoded.";
      bridge.emit({ type: "error", message });
    });
    screenTrack.addEventListener("ended", () => {
      if (!next.cancelled && recorder.state !== "inactive") {
        bridge.emit({ type: "sourceEnded" });
      }
    });

    session = next;
    return { format, size };
  } catch (error) {
    release();
    throw error;
  }
}

async function stop() {
  const current = requireSession();
  if (current.recorder.state !== "inactive") {
    current.recorder.stop();
    await current.stopped;
  }
  await current.chunkQueue;
  teardown(current);
  session = null;
  return null;
}

function cancel() {
  const current = session;
  session = null;
  if (!current) {
    return;
  }
  current.cancelled = true;
  if (current.recorder.state !== "inactive") {
    current.recorder.stop();
  }
  teardown(current);
}

function teardown(current: Session) {
  current.compositor?.stop();
  for (const stream of current.streams) {
    stream.getTracks().forEach((track) => track.stop());
  }
  void current.audioContext?.close().catch(() => undefined);
}

async function openScreen(config: CaptureStartConfig) {
  const video = {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: config.sourceId,
      maxWidth: config.requestedSize.width,
      maxHeight: config.requestedSize.height,
      maxFrameRate: FRAME_RATE,
    },
  } as MediaTrackConstraints;

  if (!config.systemAudio) {
    return getUserMedia({ audio: false, video }, "screen");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: "desktop" } } as MediaTrackConstraints,
      video,
    });
  } catch {
    const screen = await getUserMedia({ audio: false, video }, "screen");
    screen.getTracks().forEach((track) => track.stop());
    throw new Error(
      navigator.userAgent.includes("Linux")
        ? "System audio could not be captured. Make sure PulseAudio or PipeWire is running, or turn off System audio."
        : "System audio could not be captured. Turn off System audio and try again.",
    );
  }
}

async function openMicrophone(deviceId: string | null) {
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { ...audio, deviceId: { exact: deviceId } },
        video: false,
      });
    } catch (error) {
      if (!isMissingDevice(error)) {
        throw mediaError(error, "microphone");
      }
    }
  }
  return getUserMedia({ audio, video: false }, "microphone");
}

async function openCamera(deviceId: string | null) {
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: FRAME_RATE },
  };
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...video, deviceId: { exact: deviceId } },
      });
    } catch (error) {
      if (!isMissingDevice(error)) {
        throw mediaError(error, "camera");
      }
    }
  }
  return getUserMedia({ audio: false, video }, "camera");
}

async function getUserMedia(
  constraints: MediaStreamConstraints,
  kind: "screen" | "microphone" | "camera",
) {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    throw mediaError(error, kind);
  }
}

function isMissingDevice(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "OverconstrainedError" || error.name === "NotFoundError")
  );
}

function mediaError(error: unknown, kind: "screen" | "microphone" | "camera") {
  const name = error instanceof DOMException ? error.name : "";
  if (kind === "screen") {
    return new Error("The selected screen or window is no longer available.");
  }
  const device = kind === "microphone" ? "microphone" : "camera";
  if (name === "NotAllowedError") {
    return new Error(`Access to the ${device} was denied.`);
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new Error(`No ${device} is connected.`);
  }
  if (name === "NotReadableError") {
    return new Error(`The ${device} is in use by another app or could not be started.`);
  }
  return new Error(`The ${device} could not be started.`);
}

function mixAudio(sources: MediaStream[]) {
  if (sources.length === 0) {
    return { track: null, context: null };
  }
  if (sources.length === 1) {
    return { track: sources[0]?.getAudioTracks()[0] ?? null, context: null };
  }
  const context = new AudioContext({ sampleRate: 48_000 });
  const destination = context.createMediaStreamDestination();
  for (const source of sources) {
    context.createMediaStreamSource(source).connect(destination);
  }
  return { track: destination.stream.getAudioTracks()[0] ?? null, context };
}

function trackSize(track: MediaStreamTrack, fallback: Size): Size {
  const settings = track.getSettings();
  return {
    width: settings.width ?? fallback.width,
    height: settings.height ?? fallback.height,
  };
}

/**
 * Draws the screen (optionally cropped) and the circular webcam bubble into a
 * canvas. Timers drive the loop because hidden windows get no animation frames.
 */
class Compositor {
  readonly track: MediaStreamTrack;
  readonly size: Size;
  private readonly context: CanvasRenderingContext2D;
  private readonly timer: number;
  private webcamFrame: Rect;

  private constructor(
    private readonly screenVideo: HTMLVideoElement,
    private readonly cameraVideo: HTMLVideoElement | null,
    private readonly source: Rect,
    canvas: HTMLCanvasElement,
    config: CaptureStartConfig,
  ) {
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) {
      throw new Error("The recording compositor could not be created.");
    }
    this.context = context;
    this.size = { width: canvas.width, height: canvas.height };
    this.webcamFrame = config.webcamFrame;
    const stream = canvas.captureStream(FRAME_RATE);
    const track = stream.getVideoTracks()[0];
    if (!track) {
      throw new Error("The recording compositor could not be created.");
    }
    this.track = track;
    this.draw();
    this.timer = window.setInterval(() => this.draw(), 1_000 / FRAME_RATE);
  }

  static async create(
    screenTrack: MediaStreamTrack,
    camera: MediaStream | null,
    config: CaptureStartConfig,
  ) {
    const screenVideo = await playingVideo(new MediaStream([screenTrack]));
    const cameraVideo = camera ? await playingVideo(camera) : null;
    const frame = { width: screenVideo.videoWidth, height: screenVideo.videoHeight };
    const source = config.crop
      ? regionToFrameRect(config.crop.rect, config.crop.displaySize, frame)
      : { x: 0, y: 0, ...frame };
    const size = fitForH264(source);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    return new Compositor(screenVideo, cameraVideo, source, canvas, config);
  }

  setWebcamFrame(frame: Rect) {
    this.webcamFrame = frame;
  }

  stop() {
    window.clearInterval(this.timer);
    this.track.stop();
    this.screenVideo.srcObject = null;
    if (this.cameraVideo) {
      this.cameraVideo.srcObject = null;
    }
  }

  private draw() {
    const { context, size, source } = this;
    context.drawImage(
      this.screenVideo,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      size.width,
      size.height,
    );

    const camera = this.cameraVideo;
    if (!camera || camera.videoWidth === 0 || camera.videoHeight === 0) {
      return;
    }
    const circle = webcamCircle(this.webcamFrame, size);
    const square = Math.min(camera.videoWidth, camera.videoHeight);
    context.save();
    context.beginPath();
    context.arc(circle.centerX, circle.centerY, circle.radius, 0, Math.PI * 2);
    context.closePath();
    context.clip();
    context.drawImage(
      camera,
      (camera.videoWidth - square) / 2,
      (camera.videoHeight - square) / 2,
      square,
      square,
      circle.centerX - circle.radius,
      circle.centerY - circle.radius,
      circle.radius * 2,
      circle.radius * 2,
    );
    context.restore();
    context.beginPath();
    context.arc(circle.centerX, circle.centerY, circle.radius - 1.5, 0, Math.PI * 2);
    context.lineWidth = 3;
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.stroke();
  }
}

async function playingVideo(stream: MediaStream) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    });
  }
  return video;
}
