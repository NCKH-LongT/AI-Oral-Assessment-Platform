// Optional real-model smoke test. Uses an isolated Electron profile and local audio,
// never a live exam or external STT API. Set ORAL_STT_TEST_AUDIO to a short speech file.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { readFile, mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { _electron: electron } = require("@playwright/test");

test(
  "real Electron forwards both language/model choices to the bundled helper",
  {
    timeout: 240000,
    skip: !process.env.ORAL_STT_TEST_AUDIO,
  },
  async () => {
    const audio = await readFile(process.env.ORAL_STT_TEST_AUDIO);
    const server = http.createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type":
          req.url === "/audio" ? "application/octet-stream" : "text/html",
      });
      res.end(
        req.url === "/audio"
          ? audio
          : "<html><body>STT integration fixture</body></html>",
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "oral-stt-test-"));
    let desktop;
    try {
      const env = {
        ...process.env,
        ORAL_WEB_URL: `http://127.0.0.1:${server.address().port}`,
      };
      for (const key of [
        "ELECTRON_RUN_AS_NODE",
        "ORAL_PYTHON",
        "ORAL_STT_MODEL",
        "ORAL_WHISPER_MODEL",
      ])
        delete env[key];
      desktop = await electron.launch({
        args: [path.resolve("apps/desktop"), `--user-data-dir=${profile}`],
        env,
      });
      const page = await desktop.firstWindow();
      await page.waitForFunction(() => Boolean(window.oralDesktop));
      const models = await page.evaluate(() => window.oralDesktop.sttModels());
      assert.deepEqual(
        models.map((model) => [model.id, model.available]),
        [
          ["phowhisper-small", true],
          ["whisper-small", true],
        ],
      );
      for (const invalid of [
        { desktop_model: "../arbitrary", language: "en" },
        { desktop_model: "whisper-small", language: "xx" },
      ]) {
        await assert.rejects(
          page.evaluate(
            async (policy) =>
              window.oralDesktop.transcribe(new ArrayBuffer(4), {
                provider: "local",
                preprocessing: "off",
                ...policy,
              }),
            invalid,
          ),
          /Invalid STT request/,
        );
      }
      for (const model of models) {
        for (const language of ["vi", "en"]) {
          const result = await page.evaluate(
            async ({ model, language }) => {
              const audio = await (await fetch("/audio")).arrayBuffer();
              return window.oralDesktop.transcribe(audio, {
                provider: "local",
                preprocessing: "off",
                desktop_model: model,
                language,
                hotwords: ["country"],
              });
            },
            { model: model.id, language },
          );
          assert.equal(result.model, model.label);
          assert.equal(result.language, language);
          assert.equal(result.provider, "local");
          assert.ok(result.transcript.trim());
          assert.equal(result.preprocessing, "off");
          console.log(
            `${model.label}/${language}: local transcription returned ${result.transcript.length} characters`,
          );
        }
      }
    } finally {
      await desktop?.close();
      await new Promise((resolve) => server.close(resolve));
      await rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  },
);
