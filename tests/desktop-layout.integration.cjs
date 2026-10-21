// Requires the web UI on ORAL_LAYOUT_URL (default localhost:3100). All API data is mocked.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { _electron: electron, expect } = require("@playwright/test");
const { mkdtemp, rm, mkdir } = require("node:fs/promises");
const path = require("node:path");
const { tmpdir } = require("node:os");

test("desktop login, device check and question fit a laptop viewport", { timeout: 180000 }, async (t) => {
  const profile = await mkdtemp(path.join(tmpdir(), "oral-layout-"));
  const env = { ...process.env, ORAL_WEB_URL: process.env.ORAL_LAYOUT_URL || "http://127.0.0.1:3100" };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({
    args: [path.resolve("apps/desktop"), `--user-data-dir=${profile}`, "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"], env,
  });
  t.after(async () => { await desktop.evaluate(({ app }) => app.exit(0)); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });
  const page = await desktop.firstWindow();
  let authenticated = false;
  const session = { id: "layout", exam_name: "Kiểm thử phần mềm", practice: false, status: "DEVICE_CHECK", time_limit: 600, question_count: 5, started_at: null, server_time: Date.now() / 1000, final_score: null, answered_count: 0, current_attempt: null };
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url.endsWith("/auth/me") || url.endsWith("/auth/refresh"))
      return route.fulfill(authenticated ? { json: { id: "student", role: "STUDENT", name: "Nguyễn Minh Anh" } } : { status: 401, json: {} });
    if (url.endsWith("/exams/available")) return route.fulfill({ json: [{ id: "exam", name: session.exam_name, status: "ASSIGNED", time_limit: 600, question_count: 5 }] });
    if (url.endsWith("/stt/config")) return route.fulfill({ json: { provider: "local", language: "vi", preprocessing: "off" } });
    return route.fulfill({ json: session });
  });
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 680));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Đăng nhập", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Vào không gian/ })).toBeInViewport();
  await mkdir(".data/review", { recursive: true });
  await page.screenshot({ path: ".data/review/desktop-login.png" });
  authenticated = true;
  await page.reload();
  await page.getByRole("button", { name: /Mở bài thi/ }).click();
  await expect(page.getByRole("heading", { name: "Kiểm tra thiết bị", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ngôn ngữ nói", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Bắt đầu thi", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Cho phép camera & mic", exact: true })).toBeInViewport();
  for (const [width, height] of [[1280, 680], [1024, 640], [1366, 700]]) {
    await desktop.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
    await expect.poll(async () => page.evaluate(() => {
      const root = document.documentElement;
      const question = document.querySelector(".question-panel").getBoundingClientRect();
      const camera = document.querySelector(".device-panel").getBoundingClientRect();
      return root.scrollWidth <= innerWidth && root.scrollHeight <= innerHeight + 1 && question.right <= camera.left && camera.right <= innerWidth;
    })).toBe(true);
    await page.screenshot({ path: `.data/review/desktop-device-${width}.png` });
  }
  session.status = "IN_PROGRESS";
  session.started_at = Date.now() / 1000;
  session.current_attempt = { id: "attempt", sequence: 1, text: "Phân biệt kiểm thử hộp đen và kiểm thử hộp trắng. Cho ví dụ về một kỹ thuật thiết kế ca kiểm thử cho mỗi phương pháp.", status: "READY" };
  await page.reload();
  await page.getByRole("button", { name: /Mở bài thi/ }).click();
  await expect(page.locator(".question-text")).toHaveText(session.current_attempt.text);
  await expect(page.getByRole("button", { name: "Bắt đầu trả lời", exact: true })).toBeInViewport();
  await page.screenshot({ path: ".data/review/desktop-question.png" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
