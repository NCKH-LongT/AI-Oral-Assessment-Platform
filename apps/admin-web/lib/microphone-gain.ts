/** Software input gain, shared by preview recording and exam capture. */
export function gainAmplitude(db: number): number {
  if (!Number.isFinite(db) || db < -12 || db > 18)
    throw new Error("Gain microphone phải từ -12 đến +18 dB.");
  return 10 ** (db / 20);
}

export function peakDbfs(samples: Float32Array, gainDb = 0): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return Math.max(-120, 20 * Math.log10(peak * gainAmplitude(gainDb)));
}

export type MicrophoneGain = {
  stream: MediaStream;
  setGain: (db: number) => void;
  close: () => Promise<void>;
};

export async function createMicrophoneGain(
  input: MediaStream,
  db: number,
): Promise<MicrophoneGain> {
  const amplitude = gainAmplitude(db);
  const context = new AudioContext({ sampleRate: 48000 });
  const source = context.createMediaStreamSource(input);
  const gain = context.createGain();
  const output = context.createMediaStreamDestination();
  output.channelCount = 1;
  gain.gain.value = amplitude;
  source.connect(gain).connect(output);
  // Never connect live microphone audio to the speakers.
  const close = async () => {
    source.disconnect();
    gain.disconnect();
    output.stream.getTracks().forEach((track) => track.stop());
    if (context.state !== "closed") await context.close();
  };
  try {
    await context.resume();
    return {
      stream: output.stream,
      setGain(value) {
        gain.gain.setTargetAtTime(
          gainAmplitude(value),
          context.currentTime,
          0.02,
        );
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
