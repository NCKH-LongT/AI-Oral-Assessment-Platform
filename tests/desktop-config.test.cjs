const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeServerURL,
  googleLoginURL,
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
