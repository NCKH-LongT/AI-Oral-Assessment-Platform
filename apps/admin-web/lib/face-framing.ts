/** Camera framing heuristics. These measurements do not establish cheating or identity. */
export type Point = { x: number; y: number };
export type Framing = { ready: boolean; areaPercent: number; message: string };
export function assessFraming(faces: Point[][]): Framing {
  if (faces.length !== 1)
    return {
      ready: false,
      areaPercent: 0,
      message: faces.length
        ? "Chỉ một người được xuất hiện trong khung hình."
        : "Chưa thấy mặt. Nhìn vào camera và tăng ánh sáng.",
    };
  const points = faces[0];
  if (
    !points.length ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return {
      ready: false,
      areaPercent: 0,
      message: "Không đo được khuôn mặt.",
    };
  const left = Math.min(...points.map((p) => p.x)),
    right = Math.max(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y)),
    bottom = Math.max(...points.map((p) => p.y));
  const areaPercent = Math.round((right - left) * (bottom - top) * 1000) / 10;
  const centered =
    Math.abs((left + right) / 2 - 0.5) <= 0.18 &&
    Math.abs((top + bottom) / 2 - 0.5) <= 0.22;
  const contained =
    left >= 0.02 && top >= 0.02 && right <= 0.98 && bottom <= 0.98;
  const ready = contained && centered && areaPercent >= 6 && areaPercent <= 55;
  return {
    ready,
    areaPercent,
    message: ready
      ? "Khuôn mặt nằm trong vùng kiểm tra."
      : "Đặt mặt ở giữa khung hình, không bị cắt; điều chỉnh khoảng cách camera.",
  };
}
