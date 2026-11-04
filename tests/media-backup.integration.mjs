import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import ts from "typescript";
import { chromium } from "@playwright/test";

test("IndexedDB preserves audio and submit metadata across reload, isolates session/backend, then deletes on acknowledgement", async () => {
  const source = await fs.readFile(
    new URL("../apps/admin-web/lib/media-backup.ts", import.meta.url),
    "utf8",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;
  const server = http.createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url === "/backup.js" ? "text/javascript" : "text/html",
    );
    res.end(
      req.url === "/backup.js"
        ? js
        : "<!doctype html><title>Backup test</title>",
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.TEST_BROWSER_CHANNEL || undefined,
    });
    const page = await browser.newPage();
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.evaluate(async () => {
      const m = await import("/backup.js");
      await m.saveMediaBackup({
        id: "job",
        attemptId: "attempt",
        sessionId: "session",
        backend: "online",
        kind: "AUDIO",
        blob: new Blob(["original audio"]),
        savedAt: 1,
        submission: {
          key: "stable-idempotency-key",
          payload: { transcript: "My answer", processing_mode: "server_audio" },
        },
      });
    });
    await page.reload();
    const result = await page.evaluate(async () => {
      const m = await import("/backup.js");
      const rows = await m.listMediaBackups("session", "online");
      return {
        text: await rows[0].blob.text(),
        submission: rows[0].submission,
        otherSession: (await m.listMediaBackups("other", "online")).length,
        otherBackend: (await m.listMediaBackups("session", "local")).length,
      };
    });
    assert.equal(result.text, "original audio");
    assert.equal(result.submission.key, "stable-idempotency-key");
    assert.equal(result.submission.payload.transcript, "My answer");
    assert.equal(result.otherSession, 0);
    assert.equal(result.otherBackend, 0);
    const count = await page.evaluate(async () => {
      const m = await import("/backup.js");
      await m.deleteMediaBackup("job");
      return (await m.listMediaBackups("session", "online")).length;
    });
    assert.equal(count, 0);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
