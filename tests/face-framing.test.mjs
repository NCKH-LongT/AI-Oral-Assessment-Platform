import test from "node:test";
import assert from "node:assert/strict";
import { assessFraming } from "../apps/admin-web/lib/face-framing.ts";
const box = (x, y, w, h) => [
  { x, y },
  { x: x + w, y: y + h },
];
test("one centered, sufficiently large face passes", () =>
  assert.equal(assessFraming([box(0.3, 0.2, 0.4, 0.5)]).ready, true));
test("missing, multiple, tiny, cropped and off-center faces fail", () => {
  for (const faces of [
    [],
    [box(0.3, 0.2, 0.4, 0.5), box(0.3, 0.2, 0.4, 0.5)],
    [box(0.48, 0.48, 0.04, 0.04)],
    [box(-0.1, 0.2, 0.5, 0.5)],
    [box(0.01, 0.1, 0.3, 0.4)],
  ])
    assert.equal(assessFraming(faces).ready, false);
});
test("invalid coordinates fail", () =>
  assert.equal(assessFraming([[{ x: NaN, y: 0.5 }]]).ready, false));
