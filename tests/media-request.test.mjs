import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
const compile = (s) =>
  ts.transpileModule(s, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;
const url = (s) =>
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const apiURL = url(
  compile(
    await fs.readFile(
      new URL("../apps/admin-web/components/api.ts", import.meta.url),
      "utf8",
    ),
  ),
);
const source = compile(
  await fs.readFile(
    new URL("../apps/admin-web/lib/media-request.ts", import.meta.url),
    "utf8",
  ),
).replace('"../components/api"', JSON.stringify(apiURL));
const { mediaRequest } = await import(url(source));
test("stalled media requests abort and expose recoverable connection guidance", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_path, init) => {
    calls++;
    return new Promise((_resolve, reject) =>
      init.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      ),
    );
  });
  await assert.rejects(
    mediaRequest("/uploads/u/chunks/0", { method: "PUT" }, 25),
    /Bản ghi vẫn được giữ/,
  );
  assert.equal(calls, 1);
});
test("validation failures retain original errors without retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(
      { error: { code: "INVALID_STATE", message: "invalid" } },
      { status: 409 },
    );
  });
  await assert.rejects(
    mediaRequest("/uploads/u/complete", { method: "POST" }, 1000),
    /INVALID_STATE/,
  );
  assert.equal(calls, 1);
});
