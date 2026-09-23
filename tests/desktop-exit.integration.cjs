// Run separately: node --test tests/desktop-exit.integration.cjs
// Real Electron window/IPC lifecycle; uses a local fixture, never a live exam.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { _electron: electron } = require("@playwright/test");

test(
  "Electron X and quit IPC respect stay/leave, then actually exit",
  { timeout: 60000 },
  async () => {
    const server = http.createServer((_req, res) => {
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
