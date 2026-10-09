import { expect, type Page } from "@playwright/test";

export type DesktopAudioProbe = {
  captures: { stream: MediaStream; constraints: MediaStreamConstraints }[];
  recordings: { audioTrackIds: string[]; videoTrackIds: string[] }[];
  contexts: AudioContext[];
  recorders: MediaRecorder[];
  analysers: number;
  gains: number;
  destinations: number;
  worklets: number;
};

/** Observe actual browser media APIs without replacing the recorded audio. */
export async function observeDesktopAudio(page: Page) {
  const audioAssetRequests: string[] = [];
  await page.route("**/audio/**", (route) => {
    audioAssetRequests.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(() => {
    const probe: DesktopAudioProbe = {
      captures: [],
      recordings: [],
      contexts: [],
      recorders: [],
      analysers: 0,
      gains: 0,
      destinations: 0,
      worklets: 0,
    };
    (
      window as unknown as { desktopAudioProbe: DesktopAudioProbe }
    ).desktopAudioProbe = probe;
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      probe.captures.push({ stream, constraints: constraints! });
      return stream;
    };
    window.AudioContext = new Proxy(window.AudioContext, {
      construct(target, args) {
        const context = Reflect.construct(target, args) as AudioContext;
        probe.contexts.push(context);
        return context;
      },
    });
    const createAnalyser = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function () {
      probe.analysers++;
      return createAnalyser.call(this);
    };
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      probe.gains++;
      return createGain.call(this);
    };
    const createDestination =
      AudioContext.prototype.createMediaStreamDestination;
    AudioContext.prototype.createMediaStreamDestination = function () {
      probe.destinations++;
      return createDestination.call(this);
    };
    const addModule = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function (url, options) {
      probe.worklets++;
      return addModule.call(this, url, options);
    };
    window.MediaRecorder = new Proxy(window.MediaRecorder, {
      construct(target, args) {
        const stream = args[0] as MediaStream;
        probe.recordings.push({
          audioTrackIds: stream.getAudioTracks().map((track) => track.id),
          videoTrackIds: stream.getVideoTracks().map((track) => track.id),
        });
        const recorder = Reflect.construct(target, args) as MediaRecorder;
        probe.recorders.push(recorder);
        return recorder;
      },
    });
  });
  return audioAssetRequests;
}

export async function expectNoDesktopAudioControls(page: Page) {
  await expect(
    page.getByRole("slider", { name: "Gain microphone", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /RNNoise/ })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Kiểm tra độ ồn", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Kiểm tra.*độ ồn|Bỏ qua kiểm tra độ ồn/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Bản ghi dùng cho STT", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Không có bản giảm nhiễu hợp lệ", { exact: false }),
  ).toHaveCount(0);
}

export async function expectNoDesktopAudioProcessing(page: Page) {
  const observed = await page.evaluate(() => {
    const probe = (
      window as unknown as { desktopAudioProbe: DesktopAudioProbe }
    ).desktopAudioProbe;
    return {
      contexts: probe.contexts.length,
      analysers: probe.analysers,
      activeContexts: probe.contexts.filter(
        (context) => context.state !== "closed",
      ).length,
      gains: probe.gains,
      destinations: probe.destinations,
      worklets: probe.worklets,
    };
  });
  // Only the passive level meter may create an AudioContext. It can restart
  // on session transitions, but must release the previous context each time.
  expect(observed.contexts).toBe(observed.analysers);
  expect(observed.activeContexts).toBeLessThanOrEqual(1);
  expect(observed.gains).toBe(0);
  expect(observed.destinations).toBe(0);
  expect(observed.worklets).toBe(0);
}
