// Run separately: node --test tests/desktop-exit.integration.cjs
// Real Electron window/IPC lifecycle; uses a local fixture, never a live exam.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { defaults } = require("../apps/desktop/desktop-policy.cjs");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { _electron: electron, expect } = require("@playwright/test");

test(
  "Electron X and quit IPC respect stay/leave, then actually exit",
  { timeout: 60000 },
  async () => {
    let rules = { ...defaults };
    const requests = [];
    const server = http.createServer((req, res) => {
      if (
        req.url === "/api/desktop/policy" ||
        req.url === "/api/exam-sessions/fixture/desktop-policy"
      ) {
        requests.push({
          path: req.url,
          cookie: req.headers.cookie,
          client: req.headers["x-oral-client"],
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ version: 1, rules }));
      }
      if (req.url === "/api/client") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({ client: req.headers["x-oral-client"] }),
        );
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<html><body><button id="quit" onclick="window.oralDesktop.quit()">Exit</button></body></html>',
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "oral-exit-test-"));
    let desktop;
    try {
      const env = {
        ...process.env,
        ORAL_WEB_URL: `http://127.0.0.1:${server.address().port}`,
      };
      delete env.ELECTRON_RUN_AS_NODE;
      const packaged = process.env.ORAL_TEST_DESKTOP_EXE;
      desktop = await electron.launch({
        executablePath: packaged ? path.resolve(packaged) : undefined,
        args: [
          ...(packaged ? [] : [path.resolve("apps/desktop")]),
          `--user-data-dir=${profile}`,
        ],
        env,
      });
      const page = await desktop.firstWindow();
      // Electron's native unload guard owns this prompt, not Chromium's dialog.
      page.on("dialog", () => {});
      await page.waitForSelector("#quit");
      assert.equal(
        await desktop.evaluate(({ Menu }) => Menu.getApplicationMenu()),
        null,
      );
      await desktop.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.openDevTools(),
      );
      await expect
        .poll(() =>
          desktop.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened(),
          ),
        )
        .toBe(false);
      await page.evaluate(() => {
        document.cookie = "fixture_auth=present; SameSite=Lax; path=/";
      });
      assert.deepEqual(
        await page.evaluate(() => fetch("/api/client").then((r) => r.json())),
        { client: "desktop" },
      );
      // OAuth finishes while the user is in the system browser. Restore the
      // real native window through the same isolated bridge used after login.
      await desktop.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].hide();
      });
      await expect
        .poll(() =>
          desktop.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].isVisible(),
          ),
        )
        .toBe(false);
      await page.evaluate(() => window.oralDesktop.focus());
      await expect
        .poll(() =>
          desktop.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows()[0];
            return win.isVisible() && !win.isMinimized() && win.isFocused();
          }),
        )
        .toBe(true);
      // Keep this test independent of the developer's physical monitor count.
      // Multi-display rejection is covered by desktop-exam-lock.test.cjs.
      await desktop.evaluate(({ screen }) => {
        screen.getAllDisplays = () => [
          { ...screen.getPrimaryDisplay(), label: "HDMI-1" },
          { ...screen.getPrimaryDisplay(), label: "HDMI-2" },
        ];
      });
      const displayError = await page.evaluate(() =>
        window.oralDesktop.beginExam("fixture").then(
          () => null,
          (e) => e.message,
        ),
      );
      assert.match(displayError, /Hệ điều hành vẫn bật 2 màn hình/);
      assert.doesNotMatch(displayError, /Error invoking remote method/);
      await desktop.evaluate(({ screen }) => {
        screen.getAllDisplays = () => [screen.getPrimaryDisplay()];
      });
      await page.evaluate(() => window.oralDesktop.beginExam("fixture"));
      await expect
        .poll(() =>
          desktop.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].isKiosk(),
          ),
        )
        .toBe(true);
      await page.evaluate(() => window.oralDesktop.endExam());
      await expect
        .poll(() =>
          desktop.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].isKiosk(),
          ),
        )
        .toBe(false);
      assert.ok(
        requests.some(
          (request) =>
            request.path.includes("/fixture/") &&
            request.cookie?.includes("fixture_auth=present") &&
            request.client === "desktop",
        ),
      );
      rules = Object.fromEntries(
        Object.keys(defaults).map((key) => [key, false]),
      );
      await desktop.evaluate(({ screen }) => {
        screen.getAllDisplays = () => [
          screen.getPrimaryDisplay(),
          screen.getPrimaryDisplay(),
        ];
      });
      await page.evaluate(() => window.oralDesktop.beginExam("fixture"));
      assert.equal(
        await desktop.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isKiosk(),
        ),
        false,
      );
      await desktop.evaluate(({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        contents.sendInputEvent({ type: "keyDown", keyCode: "F12" });
        contents.sendInputEvent({ type: "keyUp", keyCode: "F12" });
      });
      await expect
        .poll(() =>
          desktop.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened(),
          ),
        )
        .toBe(true);
      await page.evaluate(() => window.oralDesktop.endExam());
      await expect
        .poll(() =>
          desktop.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened(),
          ),
        )
        .toBe(false);
      await page.evaluate(() => {
        window.addEventListener("beforeunload", (event) => {
          event.preventDefault();
          event.returnValue = "";
        });
      });
      await desktop.evaluate(({ dialog }) => {
        globalThis.exitChoice = 0;
        globalThis.exitPrompts = 0;
        dialog.showMessageBoxSync = () => {
          globalThis.exitPrompts++;
          return globalThis.exitChoice;
        };
      });
      // Native X/Alt+F4 route with unsaved data, user chooses Stay.
      await desktop.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await page.waitForTimeout(200);
      assert.equal(page.isClosed(), false);
      assert.equal(await desktop.evaluate(() => globalThis.exitPrompts), 1);
      // Quit button route, user also chooses Stay.
      await page.click("#quit");
      await page.waitForTimeout(200);
      assert.equal(page.isClosed(), false);
      assert.equal(await desktop.evaluate(() => globalThis.exitPrompts), 2);
      // Retry after cancelled app.quit; choosing Leave must close the process.
      await desktop.evaluate(() => {
        globalThis.exitChoice = 1;
      });
      const closed = desktop.waitForEvent("close");
      await page.click("#quit").catch((error) => {
        if (!/closed/i.test(error.message)) throw error;
      });
      await closed;
      desktop = undefined;
    } finally {
      await desktop?.close();
      await new Promise((resolve) => server.close(resolve));
      assert.equal(path.dirname(path.resolve(profile)), path.resolve(tmpdir()));
      assert.ok(path.basename(profile).startsWith("oral-exit-test-"));
      await rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  },
);
