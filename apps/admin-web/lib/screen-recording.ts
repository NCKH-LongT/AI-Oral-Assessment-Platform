// Rotate into independently playable segments without releasing screen capture.
// Uploading each segment limits the evidence lost if the app crashes.
type CaptureRun = {
  stream: MediaStream;
  recorder: MediaRecorder | null;
  stopped: Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
  stopping: boolean;
  detach: () => void;
};

function aborted() {
  return new DOMException("Đã hủy yêu cầu ghi màn hình.", "AbortError");
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void work.catch(() => {});
    return Promise.reject(aborted());
  }
  return new Promise((resolve, reject) => {
    const cancel = () => reject(aborted());
    signal.addEventListener("abort", cancel, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", cancel));
  });
}

export class ScreenRecording {
  stream: MediaStream | null = null;
  private run: CaptureRun | null = null;
  private request: AbortController | null = null;
  readonly files: Blob[] = [];

  async start(
    onInterrupted: () => void,
    onSegment: () => void,
    signal?: AbortSignal,
  ) {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const cancel = () => request.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      await abortable(this.stopRun(this.run), request.signal);
      if (request.signal.aborted) throw aborted();
      // A browser chooser cannot always be dismissed programmatically. If it
      // completes after cancellation, release that stream without adopting it.
      const pendingStream = navigator.mediaDevices
        .getDisplayMedia({
          video: { displaySurface: "monitor", frameRate: { ideal: 5, max: 5 } },
          audio: false,
        })
        .then((stream) => {
          if (request.signal.aborted || this.request !== request)
            stream.getTracks().forEach((track) => track.stop());
          return stream;
        });
      const stream = await abortable(pendingStream, request.signal);
      if (request.signal.aborted || this.request !== request) {
        stream.getTracks().forEach((track) => track.stop());
        throw aborted();
      }
      const track = stream.getVideoTracks()[0];
      if (
        !track ||
        track.readyState !== "live" ||
        (track.getSettings().displaySurface &&
          track.getSettings().displaySurface !== "monitor")
      ) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error(
          "Phải chia sẻ toàn màn hình, không chọn một cửa sổ hoặc tab.",
        );
      }
      const mime = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      if (!mime) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Thiết bị chưa hỗ trợ ghi màn hình.");
      }
      const run: CaptureRun = {
        stream,
        recorder: null,
        stopped: Promise.resolve(),
        timer: null,
        stopping: false,
        detach: () => track.removeEventListener("ended", interrupted),
      };
      const interrupted = () => {
        if (run.stopping || this.run !== run) return;
        // Stop only this run. Late recorder/track events must never stop a retry.
        void this.stopRun(run);
        onInterrupted();
      };
      this.run = run;
      this.stream = stream;
      track.addEventListener("ended", interrupted, { once: true });
      const record = () => {
        if (run.stopping) return;
        const recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: 500000,
        });
        const chunks: BlobPart[] = [];
        run.recorder = recorder;
        let resolveStopped: () => void = () => {};
        run.stopped = new Promise((resolve) => {
          resolveStopped = resolve;
        });
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onstop = () => {
          if (run.timer) clearTimeout(run.timer);
          try {
            const blob = new Blob(chunks, { type: mime.split(";")[0] });
            if (blob.size) {
              this.files.push(blob);
              onSegment();
            }
          } finally {
            resolveStopped();
          }
          if (!run.stopping) {
            try {
              record();
            } catch {
              interrupted();
            }
          }
        };
        recorder.onerror = interrupted;
        try {
          recorder.start(1000);
        } catch (error) {
          resolveStopped();
          throw error;
        }
        run.timer = setTimeout(() => {
          if (!run.stopping && recorder.state !== "inactive") recorder.stop();
        }, 60000);
      };
      try {
        record();
      } catch (error) {
        await this.stopRun(run);
        throw error;
      }
    } finally {
      signal?.removeEventListener("abort", cancel);
      if (this.request === request) this.request = null;
    }
  }

  get active() {
    const run = this.run;
    return !!(
      run &&
      !run.stopping &&
      run.recorder?.state !== "inactive" &&
      run.stream.getVideoTracks()[0]?.readyState === "live"
    );
  }

  private async stopRun(run: CaptureRun | null) {
    if (!run) return;
    run.stopping = true;
    run.detach();
    if (run.timer) clearTimeout(run.timer);
    if (run.recorder && run.recorder.state !== "inactive") run.recorder.stop();
    run.stream.getTracks().forEach((track) => track.stop());
    await run.stopped;
    if (this.run === run) {
      this.run = null;
      this.stream = null;
    }
  }

  async stop() {
    this.request?.abort();
    this.request = null;
    await this.stopRun(this.run);
  }
}
