import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../apps/admin-web/components/api.ts";

test("lost submission response retries with identical body and idempotency key", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path, init) => {
    calls.push({ path, init });
    if (calls.length === 1) throw new TypeError("fetch failed");
    return Response.json({ status: "SUBMITTED" });
  });
  const body = JSON.stringify({
    transcript: "",
    stt_confidence: null,
    processing_mode: "server_audio",
  });
  const result = await api("/question-attempts/a/submit", {
    method: "POST",
    body,
    headers: { "Idempotency-Key": "stable-key" },
  });
  assert.equal(result.status, "SUBMITTED");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body, calls[1].init.body);
  assert.equal(calls[1].init.headers["Idempotency-Key"], "stable-key");
});

test("gateway failure retries finalization, validation and unsafe mutations do not retry", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return count === 1
      ? Response.json(
          { error: { message: "upstream disconnected" } },
          { status: 502 },
        )
      : Response.json({ status: "SUBMITTED" });
  });
  await api("/exam-sessions/s/finish", { method: "POST" });
  assert.equal(count, 2);
  count = 0;
  await assert.rejects(
    api("/exam-sessions", { method: "POST", body: "{}" }),
    /HTTP 502/,
  );
  assert.equal(count, 1);
  count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return Response.json(
      { error: { code: "INVALID_STATE", message: "invalid state" } },
      { status: 409 },
    );
  });
  await assert.rejects(
    api("/question-attempts/a/submit", {
      method: "POST",
      headers: { "Idempotency-Key": "same-key" },
    }),
    /INVALID_STATE/,
  );
  assert.equal(count, 1);
});

test("exhausted retries report route and request id; caller cancellation is respected", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return Response.json(
      { error: { code: "BACKEND_UNREACHABLE", message: "connection lost" } },
      { status: 502, headers: { "X-Request-ID": "trace-123" } },
    );
  });
  await assert.rejects(
    api("/uploads/u/complete", { method: "POST" }),
    /POST \/uploads\/u\/complete.*HTTP 502.*trace-123/,
  );
  assert.equal(count, 3);
  count = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    api("/uploads/u/complete", { method: "POST", signal: controller.signal }),
  );
  assert.equal(count, 1);
});
