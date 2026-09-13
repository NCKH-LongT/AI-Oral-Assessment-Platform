const DEFAULT_URL = "http://localhost:3000";
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
module.exports = { DEFAULT_URL, normalizeServerURL };
