const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm, readFile, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  createCorrectionService,
  splitTranscript,
  validateSuggestion,
} = require("../apps/desktop/correction.cjs");

test("long transcripts are split without losing text; invalid requests rejected", () => {
  const text = "  Tôi học lập trình.\n".repeat(300);
  const chunks = splitTranscript(text);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((c) => c.length <= 1200));
  for (const value of ["", null, "a".repeat(12001), "a".repeat(1300)])
    assert.throws(() => splitTranscript(value));
  assert.equal(
    validateSuggestion("Có 12 học xinh.", "Có 12 học sinh."),
    "Có 12 học sinh.",
  );
  assert.throws(() => validateSuggestion("Có 12 học xinh.", "Có 15 học sinh."));
  assert.throws(() => validateSuggestion("Hôm nay tôi học lập trình.", ""));
});

test("model download is atomic, checksum verified and reused offline", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "oral-correction-unit-"));
  try {
    const bytes = Buffer.from("synthetic model");
    const modelInfo = {
      name: "test",
      file: "model.gguf",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      url: "https://model.invalid/model",
    };
    let calls = 0;
    const service = createCorrectionService(dir, {
      modelInfo,
      fetchModel: async () => {
        calls++;
        return new Response(bytes);
      },
    });
    assert.equal((await service.status()).installed, false);
    assert.equal((await service.install()).busy, false);
    assert.deepEqual(await readFile(path.join(dir, modelInfo.file)), bytes);
    assert.equal((await service.install()).busy, false);
    assert.equal(calls, 1);
    // A fresh process verifies a cached file without fetching it again.
    const offline = createCorrectionService(dir, {
      modelInfo,
      fetchModel: () => {
        throw new Error("Network forbidden");
      },
    });
    assert.equal((await offline.install()).installed, true);
    await writeFile(path.join(dir, modelInfo.file), Buffer.alloc(bytes.length));
    const corrupt = createCorrectionService(dir, { modelInfo });
    await assert.rejects(corrupt.install(), /checksum/);
    assert.equal((await corrupt.status()).installed, false);
    const truncated = createCorrectionService(dir, {
      modelInfo,
      fetchModel: async () => new Response("partial"),
    });
    await assert.rejects(truncated.install(), /checksum/);
    assert.equal((await truncated.status()).busy, false);
    await assert.rejects(readFile(path.join(dir, modelInfo.file + ".part")), {
      code: "ENOENT",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("download cancellation clears busy state and partial model", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "oral-correction-cancel-"));
  try {
    let begun;
    const started = new Promise((resolve) => {
      begun = resolve;
    });
    const service = createCorrectionService(dir, {
      fetchModel: async (_url, { signal }) => {
        begun();
        return new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        );
      },
    });
    const request = service.install();
    const rejected = assert.rejects(request, /Đã hủy/);
    await started;
    await assert.rejects(service.install(), /vui lòng đợi/);
    service.cancel();
    await rejected;
    assert.equal((await service.status()).busy, false);
    assert.equal((await service.status()).installed, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
