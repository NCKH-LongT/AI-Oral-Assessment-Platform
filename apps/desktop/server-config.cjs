const DEFAULT_URL = "http://localhost:3000";
function hasSameOrigin(value, origin) {
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}
function normalizeServerURL(value) {
  const url = new URL(String(value).trim());
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new Error(
      "Nhập domain gốc HTTPS, hoặc HTTP localhost; không có đường dẫn, mật khẩu hay tham số.",
    );
  }
  return url.origin;
}
function googleLoginURL(value, authOrigin) {
  const url = new URL(value);
  if (
    url.origin !== normalizeServerURL(authOrigin) ||
    url.pathname !== "/api/auth/google/start" ||
    !url.searchParams.get("flow_id") ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error(
      "Domain đăng nhập chưa khớp máy chủ. Nhờ admin kiểm tra domain gốc.",
    );
  return url.href;
}
module.exports = {
  DEFAULT_URL,
  normalizeServerURL,
  googleLoginURL,
  hasSameOrigin,
};
