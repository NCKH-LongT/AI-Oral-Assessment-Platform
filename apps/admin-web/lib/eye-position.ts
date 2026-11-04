import type { Point } from "./face-framing";
export type EyePosition = { horizontal: number; openness: number } | null;
/** Relative iris position only; not screen gaze, identity or cheating detection. */
export function eyePosition(points: Point[]): EyePosition {
  const eye = (
    a: number,
    b: number,
    iris: number,
    upper: number,
    lower: number,
  ) => {
    const values = [a, b, iris, upper, lower].map((i) => points[i]);
    if (
      values.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
    )
      return null;
    const [p, q, r, u, l] = values;
    const width = Math.hypot(q.x - p.x, q.y - p.y);
    if (width < 0.01) return null;
    return {
      horizontal:
        ((r.x - p.x) * (q.x - p.x) + (r.y - p.y) * (q.y - p.y)) /
        (width * width),
      openness: Math.hypot(u.x - l.x, u.y - l.y) / width,
    };
  };
  const left = eye(33, 133, 468, 159, 145),
    right = eye(362, 263, 473, 386, 374);
  if (!left || !right || Math.min(left.openness, right.openness) < 0.12)
    return null;
  return {
    horizontal: (left.horizontal + right.horizontal) / 2,
    openness: Math.min(left.openness, right.openness),
  };
}
