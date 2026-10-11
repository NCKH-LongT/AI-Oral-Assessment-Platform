// Rotate into independently playable segments without releasing screen capture.
// Uploading each segment limits the evidence lost if the app crashes.
export class ScreenRecording {
  stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private stopped: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;
  readonly files: Blob[] = [];

  async start(onInterrupted: () => void, onSegment: () => void) {
    await this.stop();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor", frameRate: { ideal: 5, max: 5 } },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    if (
      !track ||
      (track.getSettings().displaySurface &&
        track.getSettings().displaySurface !== "monitor")
    ) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(
        "Phải chia sẻ toàn màn hình, không chọn một cửa sổ hoặc tab.",
      );
    }
    const mime = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
      (t) => MediaRecorder.isTypeSupported(t),
    );
    if (!mime) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("Thiết bị chưa hỗ trợ ghi màn hình.");
    }
    this.stream = stream;
    this.stopping = false;
    const interrupted = () => {
      onInterrupted();
      void this.stop();
    };
    track.addEventListener("ended", interrupted, { once: true });
    const record = () => {
      if (this.stopping) return;
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: 500000,
        });
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        this.stopping = true;
        throw e;
      }
      const chunks: BlobPart[] = [];
      this.recorder = recorder;
      let resolveStopped: () => void = () => {};
      this.stopped = new Promise((resolve) => {
        resolveStopped = resolve;
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mime.split(";")[0] });
          if (blob.size) {
            this.files.push(blob);
            onSegment();
          }
          resolve();
          if (!this.stopping) {
            try {
              record();
            } catch {
              interrupted();
            }
          }
        };
      });
      recorder.onerror = interrupted;
      try {
        recorder.start(1000);
      } catch (e) {
        resolveStopped();
        throw e;
      }
      this.timer = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 60000);
    };
    try {
      record();
    } catch (e) {
      await this.stop();
      throw e;
    }
  }
  get active() {
    return (
      !this.stopping && this.stream?.getVideoTracks()[0]?.readyState === "live"
    );
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.recorder && this.recorder.state !== "inactive")
      this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.stopped;
    this.recorder = null;
    this.stream = null;
  }
}
