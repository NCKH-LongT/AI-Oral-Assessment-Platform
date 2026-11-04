import test from "node:test";
import assert from "node:assert/strict";
import { eyePosition } from "../apps/admin-web/lib/eye-position.ts";
function face() {
  const p = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [a, b, i, u, l] of [
    [33, 133, 468, 159, 145],
    [362, 263, 473, 386, 374],
  ]) {
    p[a] = { x: 0.2, y: 0.5 };
    p[b] = { x: 0.4, y: 0.5 };
    p[i] = { x: 0.3, y: 0.5 };
    p[u] = { x: 0.3, y: 0.47 };
    p[l] = { x: 0.3, y: 0.53 };
  }
  return p;
}
test("centered iris has midpoint relative position", () =>
  assert.ok(Math.abs(eyePosition(face()).horizontal - 0.5) < 1e-6));
test("closed eyes return unknown", () => {
  const p = face();
  p[145] = p[159];
  assert.equal(eyePosition(p), null);
});
test("missing landmarks return unknown", () =>
  assert.equal(eyePosition([]), null));
