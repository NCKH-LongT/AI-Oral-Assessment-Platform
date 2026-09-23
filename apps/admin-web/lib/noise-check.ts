/** Ten-second local mic recording. Only the quiet opening is used to assess ambient noise. */
export const NOISE_POLICY = {
  durationMs: 10000,
  ambientMs: 3000,
  warmupMs: 500,
  intervalMs: 100,
  thresholdDbfs: -40,
  noisyFraction: 0.2,
  minimumSignalDbfs: -90,
};

export type NoiseResult = {
  status: "quiet" | "noisy" | "no_signal";
  averageDbfs: number;
  noisyFraction: number;
};

export function rmsDbfs(samples: Float32Array): number {
  if (!samples.length) return -120;
  let energy = 0;
  for (const value of samples) energy += value * value;
  return Math.max(-120, 10 * Math.log10(energy / samples.length));
}

export function assessNoise(levels: number[]): NoiseResult {
  if (!levels.length || levels.some((level) => !Number.isFinite(level)))
    throw new Error("Không đủ tín hiệu để đo độ ồn. Vui lòng kiểm tra lại.");
  const averageDbfs =
    10 *
    Math.log10(
      levels.reduce((sum, level) => sum + 10 ** (level / 10), 0) /
        levels.length,
    );
  const noisyFraction =
    levels.filter((level) => level >= NOISE_POLICY.thresholdDbfs).length /
    levels.length;
  return {
    status:
      Math.max(...levels) < NOISE_POLICY.minimumSignalDbfs
        ? "no_signal"
        : noisyFraction >= NOISE_POLICY.noisyFraction
          ? "noisy"
          : "quiet",
    averageDbfs,
    noisyFraction,
  };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Đã hủy kiểm tra", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function measureNoise(
  deviceId: string | undefined,
  signal: AbortSignal,
  onProgress: (percent: number, dbfs: number) => void,
  gainDb = 0,
): Promise<
  NoiseResult & {
    rawAudio: Blob;
    filteredAudio?: Blob;
    filterError?: string;
    peakDbfs: number;
  }
> {
  let stream: MediaStream | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let filter: import("./noise-filter").NoiseFilter | undefined;
  let filterError: string | undefined;
  let gain: import("./microphone-gain").MicrophoneGain | undefined;
  const recordings: { recorder: MediaRecorder; done: Promise<Blob> }[] = [];
  const record = (input: MediaStream) => {
    const mimeType = ["audio/webm;codecs=opus", "audio/webm"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) throw new Error("Thiết bị chưa hỗ trợ ghi âm WebM.");
    const recorder = new MediaRecorder(input, { mimeType });
    const chunks: BlobPart[] = [];
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = () =>
        reject(new Error("Không ghi được âm thanh kiểm tra."));
    });
    // Cleanup may happen before the normal stop/await path (skip, disconnect, unmount).
    void done.catch(() => {});
    recordings.push({ recorder, done });
    recorder.start(250);
    return done;
  };
  // Construct and resume during the button gesture to satisfy autoplay policy.
  const context = new AudioContext();
  try {
    signal.throwIfAborted();
    await context.resume();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    signal.throwIfAborted();
    const track = stream.getAudioTracks()[0];
    const settings = track.getSettings();
    if (
      settings.noiseSuppression ||
      settings.autoGainControl ||
      settings.echoCancellation
    )
      throw new Error(
        "Microphone chưa tắt được xử lý âm thanh để đo tiếng ồn. Hãy thử lại hoặc bỏ qua kiểm tra.",
      );
    const { createMicrophoneGain, peakDbfs: samplePeak } =
      await import("./microphone-gain");
    gain = await createMicrophoneGain(stream, gainDb);
    try {
      const { createNoiseFilter } = await import("./noise-filter");
      filter = await createNoiseFilter(gain.stream, () => {
        filterError = "RNNoise lỗi. Chỉ có bản ghi gốc để nghe thử.";
      });
    } catch {
      filterError =
        "Không tải được RNNoise. Bạn vẫn có thể nghe bản gốc và thử lại.";
    }
    signal.throwIfAborted();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const levels: number[] = [];
    let peakDbfs = -120;
    let recordingPeak = -120;
    await wait(NOISE_POLICY.warmupMs, signal);
    const rawRecording = record(gain.stream);
    const filteredRecording = filter ? record(filter.stream) : undefined;
    const count = NOISE_POLICY.durationMs / NOISE_POLICY.intervalMs;
    for (let i = 0; i < count; i++) {
      await wait(NOISE_POLICY.intervalMs, signal);
      if (
        track.readyState !== "live" ||
        track.muted ||
        context.state !== "running"
      )
        throw new Error(
          "Microphone bị ngắt hoặc tạm dừng. Vui lòng kiểm tra lại thiết bị.",
        );
      analyser.getFloatTimeDomainData(samples);
      const level = rmsDbfs(samples);
      recordingPeak = Math.max(recordingPeak, samplePeak(samples, gainDb));
      peakDbfs = Math.max(peakDbfs, level);
      if ((i + 1) * NOISE_POLICY.intervalMs <= NOISE_POLICY.ambientMs)
        levels.push(level);
      onProgress(
        Math.round(((i + 1) / count) * 100),
        samplePeak(samples, gainDb),
      );
    }
    for (const { recorder } of recordings)
      if (recorder.state !== "inactive") recorder.stop();
    const rawAudio = await rawRecording;
    const filteredAudio = filteredRecording
      ? await filteredRecording
      : undefined;
    if (!rawAudio.size)
      throw new Error("Bản ghi kiểm tra rỗng. Vui lòng thử lại.");
    const result = assessNoise(levels);
    if (
      result.status === "no_signal" &&
      peakDbfs >= NOISE_POLICY.minimumSignalDbfs
    )
      result.status = "quiet";
    return {
      ...result,
      rawAudio,
      filteredAudio: filterError ? undefined : filteredAudio,
      filterError,
      peakDbfs: recordingPeak,
    };
  } finally {
    for (const { recorder } of recordings)
      if (recorder.state !== "inactive") recorder.stop();
    source?.disconnect();
    await filter?.close();
    await gain?.close();
    stream?.getTracks().forEach((track) => track.stop());
    await context.close();
  }
}
