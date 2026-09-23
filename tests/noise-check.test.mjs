import { test } from "node:test";
import assert from "node:assert/strict";
import { assessNoise, rmsDbfs } from "../apps/admin-web/lib/noise-check.ts";
import {
  gainAmplitude,
  peakDbfs,
} from "../apps/admin-web/lib/microphone-gain.ts";

test("microphone gain uses amplitude dB and detects clipping without hiding overload", () => {
  assert.equal(gainAmplitude(0), 1);
  assert.ok(Math.abs(gainAmplitude(6) - 1.99526) < 0.00001);
  assert.ok(
    Math.abs(peakDbfs(new Float32Array([0.5, -0.5]), 6) + 0.0206) < 0.001,
  );
  assert.ok(peakDbfs(new Float32Array([0.5]), 12) > 0);
  assert.equal(peakDbfs(new Float32Array([0])), -120);
  for (const gain of [NaN, Infinity, -13, 19])
    assert.throws(() => gainAmplitude(gain));
});

test("RMS uses signal energy and dBFS, including silence", () => {
  assert.equal(rmsDbfs(new Float32Array(2048)), -120);
  assert.ok(Math.abs(rmsDbfs(new Float32Array([0.1, -0.1])) + 20) < 0.001);
  assert.equal(rmsDbfs(new Float32Array([1, -1])), 0);
});

test("quiet room, sustained noise, intermittent noise and missing signal", () => {
  assert.equal(assessNoise(Array(50).fill(-55)).status, "quiet");
  assert.equal(assessNoise(Array(50).fill(-30)).status, "noisy");
  assert.equal(
    assessNoise([...Array(40).fill(-55), ...Array(10).fill(-39)]).status,
    "noisy",
  );
  assert.equal(assessNoise([...Array(49).fill(-55), -10]).status, "quiet");
  assert.equal(assessNoise(Array(50).fill(-120)).status, "no_signal");
  assert.throws(() => assessNoise([]));
  assert.throws(() => assessNoise([NaN]));
});
