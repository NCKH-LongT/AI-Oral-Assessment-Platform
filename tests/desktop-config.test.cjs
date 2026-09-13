const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeServerURL } = require("../apps/desktop/server-config.cjs");
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
