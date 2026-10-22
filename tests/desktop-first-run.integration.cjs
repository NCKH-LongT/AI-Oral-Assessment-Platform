const { test } = require("node:test");
const assert = require("node:assert/strict");
const { _electron: electron } = require("@playwright/test");
const { createServer } = require("node:http");
const { mkdtemp, rm, access } = require("node:fs/promises");
const path = require("node:path");
const { tmpdir } = require("node:os");

test(
  "first launch skips model download and server denies unauthorized download",
  { timeout: 60000 },
  async (t) => {
    const profile = await mkdtemp(path.join(tmpdir(), "oral-first-run-"));
    let policyRequests = 0;
    const server = createServer((req, res) => {
      if (req.url === "/api/stt/config") {
        policyRequests++;
        assert.equal(req.headers["x-oral-backend"], "local");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ desktop_download_allowed: false }));
      } else res.end("<html><body>OralAI test</body></html>");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let desktop;
    t.after(async () => {
      if (desktop)
        await desktop.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await new Promise((resolve) => server.close(resolve));
      await rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 250,
      });
    });
    const env = {
      ...process.env,
      ORAL_WEB_URL: `http://127.0.0.1:${server.address().port}`,
      ORAL_MODEL_DOWNLOAD: "1",
    };
    delete env.ELECTRON_RUN_AS_NODE;
    desktop = await electron.launch({
      executablePath: process.env.ORAL_TEST_DESKTOP_EXE,
      args: [
        ...(process.env.ORAL_TEST_DESKTOP_EXE
          ? []
          : [path.resolve("apps/desktop")]),
        `--user-data-dir=${profile}`,
      ],
      env,
    });
    const page = await desktop.firstWindow();
    await page.waitForURL(`${env.ORAL_WEB_URL}/**`);
    assert.equal(policyRequests, 0);
    await assert.rejects(
      access(path.join(profile, "stt/whisper-small/model.bin")),
    );
    const result = await page.evaluate(async () => {
      try {
        await window.oralDesktop.downloadModel("local");
        return "unexpected success";
      } catch (error) {
        return error.message;
      }
    });
    assert.notEqual(result, "unexpected success");
    assert.equal(policyRequests, 1);
    await assert.rejects(
      access(path.join(profile, "stt/whisper-small.download")),
    );
  },
);
