import { test } from "node:test";
import assert from "node:assert/strict";
import { ScreenRecording } from "../apps/admin-web/lib/screen-recording.ts";

function media(t, surface = "monitor", failStart = false) {
  const track = new EventTarget();
  track.readyState = "live";
  track.getSettings = () => ({ displaySurface: surface });
  track.stop = () => {
    track.readyState = "ended";
  };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  const recorders = [];
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    state = "inactive";
    constructor() {
      recorders.push(this);
    }
    start() {
      if (failStart) throw new Error("Encoder failed");
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable({ data: new Blob(["independent-video"]) });
        this.onstop();
      });
    }
  }
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getDisplayMedia: async () => stream },
  });
  globalThis.MediaRecorder = Recorder;
  t.after(() => {
    delete navigator.mediaDevices;
    delete globalThis.MediaRecorder;
  });
  return { track, recorders };
}

test("screen segments rotate without releasing capture, and final stop saves the tail", async (t) => {
  const { track, recorders } = media(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const capture = new ScreenRecording();
  let segments = 0;
  await capture.start(
    () => assert.fail("Unexpected interruption"),
    () => segments++,
  );
  t.mock.timers.tick(60000);
  await Promise.resolve();
  assert.equal(segments, 1);
  assert.equal(recorders.length, 2);
  assert.equal(track.readyState, "live");
  assert.equal(capture.active, true);
  await capture.stop();
  assert.equal(segments, 2);
  assert.equal(capture.files.length, 2);
  assert.equal(track.readyState, "ended");
  assert.equal(capture.active, false);
  await capture.stop();
  assert.equal(capture.files.length, 2);
});

test("sharing a window is rejected and the stream is released", async (t) => {
  const { track } = media(t, "window");
  await assert.rejects(
    new ScreenRecording().start(
      () => {},
      () => {},
    ),
    /toàn màn hình/,
  );
  assert.equal(track.readyState, "ended");
});

test(
  "encoder start failure settles cleanup without hanging",
  { timeout: 2000 },
  async (t) => {
    const { track } = media(t, "monitor", true);
    await assert.rejects(
      new ScreenRecording().start(
        () => {},
        () => {},
      ),
      /Encoder failed/,
    );
    assert.equal(track.readyState, "ended");
  },
);

test("revoked screen permission interrupts the answer and keeps available evidence", async (t) => {
  const { track } = media(t);
  const capture = new ScreenRecording();
  let interruptions = 0;
  await capture.start(
    () => interruptions++,
    () => {},
  );
  track.dispatchEvent(new Event("ended"));
  await capture.stop();
  assert.equal(interruptions, 1);
  assert.equal(capture.files.length, 1);
  assert.equal(capture.active, false);
});
