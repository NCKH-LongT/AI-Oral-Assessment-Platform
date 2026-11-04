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

test("incremental recording survives reload with ordered chunks and isolated sessions", async () => {
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
    res.end(req.url === "/backup.js" ? js : "<!doctype html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.TEST_BROWSER_CHANNEL || undefined,
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async () => {
      const m = await import("/backup.js");
      for (const sequence of [1, 0, 2])
        await m.saveRecordingPart({
          id: "recording",
          sequence,
          attemptId: "attempt",
          sessionId: "session",
          backend: "online",
          kind: "AUDIO",
          blob: new Blob([String(sequence)], { type: "audio/webm" }),
          savedAt: 1,
        });
    });
    await page.reload();
    const result = await page.evaluate(async () => {
      const m = await import("/backup.js");
      const rows = await m.listPartialRecordings("session", "online");
      const text = await rows[0].blob.text();
      const other = (await m.listPartialRecordings("other", "online")).length;
      await m.deleteRecordingParts("recording");
      return {
        text,
        other,
        remaining: (await m.listPartialRecordings("session", "online")).length,
      };
    });
    assert.deepEqual(result, { text: "012", other: 0, remaining: 0 });
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("real browser recording chunks can be restored and decoded after reload", async () => {
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
    res.end(req.url === "/backup.js" ? js : "<!doctype html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.TEST_BROWSER_CHANNEL || undefined,
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async () => {
      const m = await import("/backup.js"),
        context = new AudioContext(),
        oscillator = context.createOscillator(),
        destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      await context.resume();
      const recorder = new MediaRecorder(destination.stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      let sequence = 0,
        writes = Promise.resolve();
      recorder.ondataavailable = (e) => {
        if (e.data.size) {
          const n = sequence++;
          writes = writes.then(() =>
            m.saveRecordingPart({
              id: "real",
              sequence: n,
              attemptId: "attempt",
              sessionId: "session",
              backend: "online",
              kind: "AUDIO",
              blob: e.data,
              savedAt: Date.now(),
            }),
          );
        }
      };
      const stopped = new Promise((resolve) => (recorder.onstop = resolve));
      recorder.start(250);
      await new Promise((resolve) => setTimeout(resolve, 1400));
      recorder.stop();
      await stopped;
      await writes;
      oscillator.stop();
      await context.close();
    });
    await page.reload();
    const decoded = await page.evaluate(async () => {
      const m = await import("/backup.js"),
        rows = await m.listPartialRecordings("session", "online"),
        context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(
          await rows[0].blob.arrayBuffer(),
        );
        return { duration: buffer.duration, channels: buffer.numberOfChannels };
      } finally {
        await context.close();
      }
    });
    assert.ok(decoded.duration > 1);
    assert.ok(decoded.channels >= 1);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
