const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile, readFile, rm, stat } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createModelInstaller } = require("../apps/desktop/model-installer.cjs");

async function fixture(t, fetchFile) {
  const directory = await mkdtemp(path.join(tmpdir(), "oral-model-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const license = path.join(directory, "LICENSE.txt");
  await writeFile(license, "MIT");
  const data = Buffer.from("verified-model");
  const spec = { id: "test/model", revision: "pinned-revision", files: [{ name: "model.bin", size: data.length, sha256: createHash("sha256").update(data).digest("hex") }] };
  return { directory, data, options: { directory, license, spec, fetchFile } };
}

test("downloads a pinned model, verifies SHA-256, promotes atomically and reuses it offline", async (t) => {
  let requests = 0;
  const f = await fixture(t, async (url) => {
    requests++;
    assert.match(url, /\/resolve\/pinned-revision\/model.bin$/);
    return new Response(f.data);
  });
  const installer = createModelInstaller(f.options);
  assert.equal(await installer.ready(), false);
  const [first, second] = await Promise.all([installer.start(), installer.start()]);
  assert.equal(first, second);
  assert.equal(requests, 1);
  assert.equal(await installer.ready(), true);
  assert.deepEqual(await readFile(path.join(first, "model.bin")), f.data);
  assert.equal(await readFile(path.join(first, "LICENSE.txt"), "utf8"), "MIT");
  const offline = createModelInstaller({ ...f.options, fetchFile: () => { throw new Error("offline"); } });
  await offline.start();
  assert.equal(offline.status().stage, "ready");
});

test("corrupt content is rejected and retried before becoming available", async (t) => {
  let requests = 0;
  const f = await fixture(t, async () => new Response(++requests === 1 ? Buffer.alloc(f.data.length) : f.data));
  const installer = createModelInstaller(f.options);
  await installer.start();
  assert.equal(requests, 2);
  assert.equal(await installer.ready(), true);
});

test("repeated network failure leaves no installed model and manual retry succeeds", async (t) => {
  let fail = true, requests = 0;
  const f = await fixture(t, async () => { requests++; if (fail) throw new Error("offline"); return new Response(f.data); });
  const installer = createModelInstaller(f.options);
  await assert.rejects(installer.start(), /offline/);
  assert.equal(requests, 3);
  assert.equal(await installer.ready(), false);
  assert.equal(installer.status().stage, "error");
  await assert.rejects(stat(path.join(installer.target, "model.bin")), { code: "ENOENT" });
  fail = false;
  await installer.start();
  assert.equal(await installer.ready(), true);
});
