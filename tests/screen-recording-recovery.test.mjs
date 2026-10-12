import { test } from "node:test";
import assert from "node:assert/strict";
import { ScreenRecording } from "../apps/admin-web/lib/screen-recording.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(t) {
  const requests = [];
  const recorders = [];
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getDisplayMedia: () => {
        const request = deferred();
        requests.push(request);
        return request.promise;
      },
    },
  });
  class Recorder {
    static isTypeSupported = () => true;
    state = "inactive";
    constructor() {
      recorders.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable({ data: new Blob(["evidence"]) });
        this.onstop();
      });
    }
  }
  globalThis.MediaRecorder = Recorder;
  t.after(() => {
    delete navigator.mediaDevices;
    delete globalThis.MediaRecorder;
  });
  const stream = () => {
    const track = new EventTarget();
    track.readyState = "live";
    track.getSettings = () => ({ displaySurface: "monitor" });
    track.stop = () => {
      track.readyState = "ended";
    };
    return { getVideoTracks: () => [track], getTracks: () => [track] };
  };
  return { requests, stream, recorders };
}

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test("canceling a pending chooser settles immediately and disposes its late stream", async (t) => {
  const { requests, stream } = fixture(t);
  const capture = new ScreenRecording();
  const starting = capture.start(
    () => assert.fail("unexpected incident"),
    () => {},
  );
  const rejected = assert.rejects(starting, { name: "AbortError" });
  await settle();
  await capture.stop();
  await rejected;
  const late = stream();
  requests[0].resolve(late);
  await settle();
  assert.equal(late.getTracks()[0].readyState, "ended");
  assert.equal(capture.active, false);
  assert.equal(capture.stream, null);
  assert.equal(capture.files.length, 0);
});

test("a newer capture supersedes a pending chooser without leaking or stopping the retry", async (t) => {
  const { requests, stream } = fixture(t);
  const capture = new ScreenRecording();
  const first = capture.start(
    () => {},
    () => {},
  );
  const rejected = assert.rejects(first, { name: "AbortError" });
  await settle();
  const retry = capture.start(
    () => assert.fail("unexpected incident"),
    () => {},
  );
  await settle();
  const fresh = stream();
  requests[1].resolve(fresh);
  await retry;
  const stale = stream();
  requests[0].resolve(stale);
  await rejected;
  await settle();
  assert.equal(stale.getTracks()[0].readyState, "ended");
  assert.equal(fresh.getTracks()[0].readyState, "live");
  assert.equal(capture.stream, fresh);
  assert.equal(capture.active, true);
  await capture.stop();
});

test("failed and repeated recovery keeps prior segments and ignores stale encoder events", async (t) => {
  const { requests, stream, recorders } = fixture(t);
  const capture = new ScreenRecording();
  let incidents = 0;
  const start = () =>
    capture.start(
      () => incidents++,
      () => {},
    );
  const initial = start();
  await settle();
  requests[0].resolve(stream());
  await initial;
  await capture.stop();
  assert.equal(capture.files.length, 1);
  const denied = start();
  await settle();
  requests[1].reject(new DOMException("Permission denied", "NotAllowedError"));
  await assert.rejects(denied, { name: "NotAllowedError" });
  assert.equal(capture.files.length, 1);
  const retry = start();
  await settle();
  requests[2].resolve(stream());
  await retry;
  recorders[0].onerror();
  assert.equal(capture.active, true);
  assert.equal(incidents, 0);
  await capture.stop();
  assert.equal(capture.files.length, 2);
});

test("an ended screen track cannot make recovery appear successful", async (t) => {
  const { requests, stream } = fixture(t);
  const capture = new ScreenRecording();
  const starting = capture.start(
    () => {},
    () => {},
  );
  await settle();
  const ended = stream();
  ended.getTracks()[0].stop();
  requests[0].resolve(ended);
  await assert.rejects(starting, /toàn màn hình/);
  assert.equal(capture.active, false);
});
