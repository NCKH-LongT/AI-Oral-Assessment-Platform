// Opt-in: downloads ~464 MiB from the pinned Hugging Face revision into a clean test profile.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { _electron: electron, expect } = require("@playwright/test");
const { mkdtemp, rm, stat, mkdir } = require("node:fs/promises");
const path = require("node:path");
const { tmpdir } = require("node:os");

test("light desktop installs a verified model on first launch and reuses it on restart", {
  skip: process.env.ORAL_TEST_DOWNLOAD !== "1", timeout: 300000,
}, async (t) => {
  const profile = await mkdtemp(path.join(tmpdir(), "oral-first-run-"));
  const env = { ...process.env, ORAL_MODEL_DOWNLOAD: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ORAL_PYTHON;
  delete env.ORAL_WHISPER_MODEL;
  delete env.ORAL_STT_MODEL;
  const executablePath = process.env.ORAL_TEST_DESKTOP_EXE;
  let desktop;
  t.after(async () => {
    if (desktop) await desktop.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  });
  async function launch() {
    desktop = await electron.launch({ executablePath,
      args: [...(executablePath ? [] : [path.resolve("apps/desktop")]), `--user-data-dir=${profile}`], env,
    });
    return desktop.firstWindow();
  }
  let page = await launch();
  await expect(page.getByRole("heading", { name: "Chuẩn bị giọng nói của bạn" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toBeVisible();
  await mkdir(".data/review", { recursive: true });
  await page.screenshot({ path: ".data/review/desktop-first-run.png" });
  await page.waitForURL("https://oral-test.paperlens.uk/**", { timeout: 240000 });
  await expect(page.getByRole("heading", { name: "Đăng nhập", exact: true })).toBeVisible();
  await expect(page.locator(".login-shell")).toHaveCSS("min-height", "0px", { timeout: 15000 });
  const model = path.join(profile, "stt/whisper-small/model.bin");
  const before = await stat(model);
  assert.equal(before.size, 483546902);
  await desktop.evaluate(({ app }) => app.exit(0));
  desktop = undefined;
  // Wait for profile files to be released before relaunching the same profile.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  page = await launch();
  await page.waitForURL("https://oral-test.paperlens.uk/**", { timeout: 30000 });
  await expect(page.getByRole("heading", { name: "Đăng nhập", exact: true })).toBeVisible();
  await expect(page.locator(".login-shell")).toHaveCSS("min-height", "0px", { timeout: 15000 });
  assert.equal((await stat(model)).mtimeMs, before.mtimeMs);
  await page.screenshot({ path: ".data/review/desktop-light-login.png" });
});
