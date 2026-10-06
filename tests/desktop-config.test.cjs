const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validHotwords, validModel } = require("../apps/desktop/stt-policy.cjs");

test("desktop permits only the two bundled STT model ids", () => {
  for (const id of ["phowhisper-small", "whisper-small"])
    assert.equal(validModel(id), true);
  for (const id of [
    undefined,
    null,
    {},
    "small.en",
    "../../model",
    "toString",
    "__proto__",
  ])
    assert.equal(validModel(id), false);
});

test("desktop accepts the complete course vocabulary and enforces server limits", () => {
  assert.equal(validHotwords(undefined), true);
  assert.equal(validHotwords([]), true);
  assert.equal(
    validHotwords(
      Array.from({ length: 200 }, (_, i) => `Thuật ngữ chuyên ngành ${i}`),
    ),
    true,
  );
  const boundary = Array.from({ length: 500 }, (_, i) =>
    String(i).padEnd(20, "x"),
  );
  assert.equal(validHotwords(boundary), true);
  assert.equal(validHotwords([...boundary, "extra"]), false);
  assert.equal(validHotwords(["x".repeat(101)]), false);
  assert.equal(validHotwords(boundary.map((word) => word + "x")), false);
  assert.equal(validHotwords(["😀".repeat(100)]), true);
  for (const value of [null, "word", [1], [{}]])
    assert.equal(validHotwords(value), false);
});
const {
  normalizeServerURL,
  googleLoginURL,
  hasSameOrigin,
} = require("../apps/desktop/server-config.cjs");
test("desktop root domain permits HTTPS and loopback, rejects credentials and paths", () => {
  assert.equal(
    normalizeServerURL(" https://oral.example.edu/ "),
    "https://oral.example.edu",
  );
  assert.equal(
    normalizeServerURL("http://localhost:3000"),
    "http://localhost:3000",
  );
  for (const url of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://remote.example.edu",
    "https://admin:secret@oral.example.edu",
    "https://oral.example.edu/api",
    "https://oral.example.edu?token=x",
    "https://oral.example.edu/#x",
  ]) {
    assert.throws(() => normalizeServerURL(url));
  }
});

test("media permission accepts serialized origins with trailing slash", () => {
  for (const url of [
    "http://localhost:3001",
    "http://localhost:3001/",
    "http://localhost:3001/exam",
  ])
    assert.equal(hasSameOrigin(url, "http://localhost:3001"), true);
  for (const url of [
    undefined,
    "null",
    "file:///tmp/test",
    "http://localhost:3000/",
    "https://evil.example/",
    "http://localhost:3001.evil.example/",
  ])
    assert.equal(hasSameOrigin(url, "http://localhost:3001"), false);
});

test("Google opens only the configured backend origin and start endpoint", () => {
  const origin = "http://localhost:3000";
  const url = origin + "/api/auth/google/start?flow_id=test-flow";
  assert.equal(googleLoginURL(url, origin), url);
  const remote = "https://oral.example.edu";
  assert.equal(
    googleLoginURL(remote + "/api/auth/google/start?flow_id=test-flow", remote),
    remote + "/api/auth/google/start?flow_id=test-flow",
  );
  for (const invalid of [
    "http://localhost:3001/api/auth/google/start?flow_id=test-flow",
    "https://evil.example/api/auth/google/start?flow_id=test-flow",
    "http://localhost:3000.evil.example/api/auth/google/start?flow_id=test-flow",
    origin + "/api/auth/google/callback?flow_id=test-flow",
    origin + "/api/auth/google/start",
    origin + "/api/auth/google/start?flow_id=",
    origin + "/api/auth/google/start?flow_id=test-flow#fragment",
    "http://user:secret@localhost:3000/api/auth/google/start?flow_id=test-flow",
    "file:///api/auth/google/start?flow_id=test-flow",
    "javascript:alert(1)",
  ]) {
    assert.throws(() => googleLoginURL(invalid, origin), invalid);
  }
});
