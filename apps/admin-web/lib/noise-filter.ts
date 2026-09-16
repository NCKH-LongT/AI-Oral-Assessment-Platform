/** RNNoise at 48 kHz. No microphone audio is connected to the speakers. */
export type NoiseFilter = {
  stream: MediaStream;
  setEnabled: (enabled: boolean) => void;
  close: () => Promise<void>;
};

export async function createNoiseFilter(
  input: MediaStream,
  onFailure?: () => void,
): Promise<NoiseFilter> {
  const context = new AudioContext({ sampleRate: 48000 });
  let source: MediaStreamAudioSourceNode | undefined;
  let node:
    import("@sapphi-red/web-noise-suppressor").RnnoiseWorkletNode | undefined;
  let output: MediaStreamAudioDestinationNode | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    source?.disconnect();
    node?.disconnect();
    node?.destroy();
    output?.stream.getTracks().forEach((track) => track.stop());
    if (context.state !== "closed") await context.close();
  };
  try {
    await context.resume();
    const { RnnoiseWorkletNode, loadRnnoise } =
      await import("@sapphi-red/web-noise-suppressor");
    const wasmBinary = await loadRnnoise({
      url: "/audio/rnnoise.wasm",
      simdUrl: "/audio/rnnoise_simd.wasm",
    });
    await context.audioWorklet.addModule("/audio/rnnoiseWorklet.js");
    source = context.createMediaStreamSource(input);
    node = new RnnoiseWorkletNode(context, { wasmBinary, maxChannels: 1 });
    output = context.createMediaStreamDestination();
    output.channelCount = 1;
    const dry = context.createGain(),
      wet = context.createGain();
    source.connect(dry).connect(output);
    source.connect(node).connect(wet).connect(output);
    dry.gain.value = 0;
    wet.gain.value = 1;
    node.onprocessorerror = () => {
      dry.gain.value = 1;
      wet.gain.value = 0;
      onFailure?.();
    };
    return {
      stream: output.stream,
      setEnabled(enabled) {
        dry.gain.value = enabled ? 0 : 1;
        wet.gain.value = enabled ? 1 : 0;
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
