import type { Point } from "./face-framing";

export type GazeStatus =
  | "CENTER"
  | "LOOK_LEFT"
  | "LOOK_RIGHT"
  | "LOOK_DOWN"
  | "LOOK_UP"
  | "HEAD_TURNED_LEFT"
  | "HEAD_TURNED_RIGHT"
  | "HEAD_BOWED"
  | "EYES_CLOSED";

export type EyePosition = {
  horizontal: number; // 0 (user's right) to 1 (user's left), midpoint ~0.5
  vertical: number;   // 0 (looking up) to 1 (looking down), midpoint ~0.5
  openness: number;   // eye openness ratio
  headYaw: number;    // negative = turned right, positive = turned left, 0 = straight
  headPitch: number;  // negative = looking up, positive = bowed down, 0 = straight
  gazeStatus: GazeStatus;
} | null;

/**
 * 3D/2D Landmark-based Eye Tracking & Head Orientation.
 * Calculates normalized iris displacement, vertical glance, and head pose.
 */
export function eyePosition(points: Point[]): EyePosition {
  if (!points || !points.length) return null;

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
    const height = Math.hypot(u.x - l.x, u.y - l.y);
    if (width < 0.005) return null;

    // Horizontal relative projection: (r - p) projected on vector (q - p)
    const horizontal =
      ((r.x - p.x) * (q.x - p.x) + (r.y - p.y) * (q.y - p.y)) /
      (width * width);

    // Vertical relative projection: (r - u) projected on vector (l - u)
    const vertical =
      height > 0.002
        ? ((r.x - u.x) * (l.x - u.x) + (r.y - u.y) * (l.y - u.y)) /
          (height * height)
        : 0.5;

    return {
      horizontal,
      vertical,
      openness: height / width,
    };
  };

  const rightEye = eye(33, 133, 468, 159, 145);
  const leftEye = eye(362, 263, 473, 386, 374);

  // If eye landmarks or iris are not available or eyes are tightly closed
  if (!rightEye || !leftEye) return null;
  const openness = Math.min(rightEye.openness, leftEye.openness);
  if (openness < 0.05) return null; // Eyes closed

  const horizontal = (rightEye.horizontal + leftEye.horizontal) / 2;
  const vertical = (rightEye.vertical + leftEye.vertical) / 2;

  // Head Yaw (Quay đầu trái/phải) & Pitch (Cúi/Ngửa đầu)
  let headYaw = 0;
  let headPitch = 0;
  const nose = points[1];
  const chin = points[152];
  const forehead = points[10];
  const cheekRight = points[234];
  const cheekLeft = points[454];

  if (
    nose &&
    chin &&
    forehead &&
    cheekRight &&
    cheekLeft &&
    [nose, chin, forehead, cheekRight, cheekLeft].every(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y)
    )
  ) {
    const faceWidth = cheekLeft.x - cheekRight.x;
    if (faceWidth > 0.02) {
      const faceCenter = (cheekLeft.x + cheekRight.x) / 2;
      headYaw = (nose.x - faceCenter) / (faceWidth / 2);
    }
    const faceHeight = chin.y - forehead.y;
    if (faceHeight > 0.02) {
      const upperDist = nose.y - forehead.y;
      const lowerDist = chin.y - nose.y;
      headPitch = (upperDist - lowerDist) / faceHeight;
    }
  }

  // Determine primary gaze / head status
  let gazeStatus: GazeStatus = "CENTER";
  if (headYaw < -0.32) {
    gazeStatus = "HEAD_TURNED_RIGHT";
  } else if (headYaw > 0.32) {
    gazeStatus = "HEAD_TURNED_LEFT";
  } else if (headPitch > 0.28) {
    gazeStatus = "HEAD_BOWED";
  } else if (horizontal < 0.42) {
    gazeStatus = "LOOK_RIGHT";
  } else if (horizontal > 0.58) {
    gazeStatus = "LOOK_LEFT";
  } else if (vertical > 0.65) {
    gazeStatus = "LOOK_DOWN";
  } else if (vertical < 0.35) {
    gazeStatus = "LOOK_UP";
  }

  return {
    horizontal,
    vertical,
    openness,
    headYaw,
    headPitch,
    gazeStatus,
  };
}
