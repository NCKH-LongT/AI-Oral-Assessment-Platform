/** Local preflight using Web Audio; no recording, upload or calibrated SPL measurement. */
export const NOISE_POLICY = {
  durationMs: 5000,
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
): Promise<NoiseResult> {
  let stream: MediaStream | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
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
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const levels: number[] = [];
    await wait(NOISE_POLICY.warmupMs, signal);
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
      levels.push(level);
      onProgress(Math.round(((i + 1) / count) * 100), level);
    }
    return assessNoise(levels);
  } finally {
    source?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    await context.close();
  }
}
