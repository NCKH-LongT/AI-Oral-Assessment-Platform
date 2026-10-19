// Fetch policies in the main process, never accept renderer-provided switches.
const keys = [
  "require_screen",
  "require_camera",
  "single_display",
  "kiosk",
  "block_shortcuts",
  "block_clipboard",
  "block_navigation",
  "block_downloads",
  "pause_on_focus_loss",
  "block_devtools",
];
const defaults = Object.freeze(
  Object.fromEntries(keys.map((key) => [key, true])),
);
async function fetchPolicy(electronSession, origin, sessionId) {
  const path =
    sessionId === undefined
      ? "/api/desktop/policy"
      : `/api/exam-sessions/${encodeURIComponent(sessionId)}/desktop-policy`;
  if (
    sessionId !== undefined &&
    (typeof sessionId !== "string" || !sessionId || sessionId.length > 100)
  )
    throw new Error("Lượt thi không hợp lệ.");
  const response = await electronSession.fetch(new URL(path, origin).href, {
    headers: { "X-Oral-Client": "desktop" },
    credentials: "include",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      "Không tải được quy định desktop. Kiểm tra đăng nhập và kết nối rồi thử lại.",
    );
  const data = await response.json();
  if (
    data.version !== 1 ||
    !data.rules ||
    keys.some((key) => typeof data.rules[key] !== "boolean")
  )
    throw new Error(
      "Quy định desktop không tương thích. Cập nhật ứng dụng rồi thử lại.",
    );
  return Object.fromEntries(keys.map((key) => [key, data.rules[key]]));
}
module.exports = { defaults, fetchPolicy };
