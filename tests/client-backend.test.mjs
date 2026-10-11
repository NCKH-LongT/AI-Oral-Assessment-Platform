import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  backendConfig,
  proxyBackend,
  switchBackend,
} from "../apps/admin-web/lib/client-backend.mjs";

test("client mode is opt-in and accepts only configured root origins", () => {
  assert.equal(backendConfig({}), null);
  assert.equal(
    backendConfig({ ORAL_CLIENT_ENABLED: "1" }).defaultMode,
    "online",
  );
  for (const url of [
    "http://remote.test",
    "https://user:pass@example.com",
    "https://example.com/api",
    "file:///tmp/a",
  ])
    assert.throws(() =>
      backendConfig({ ORAL_CLIENT_ENABLED: "1", ORAL_ONLINE_BACKEND_URL: url }),
    );
  assert.throws(() =>
    backendConfig({ ORAL_CLIENT_ENABLED: "1", ORAL_BACKEND_MODE: "typo" }),
  );
});

test("proxy isolates logins, validates browser origin and keeps uploads intact", async (t) => {
  const calls = [];
  async function server(mode) {
    const app = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      calls.push({
        mode,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks),
      });
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/health")
        return res.end(JSON.stringify({ status: "ok" }));
      if (req.url === "/api/login")
        res.setHeader("Set-Cookie", [
          `access_token=${mode}-access; Domain=localhost; HttpOnly; Secure; Path=/; SameSite=Lax`,
          `refresh_token=${mode}-refresh; HttpOnly; Path=/; SameSite=Lax`,
        ]);
      if (req.url === "/api/logout")
        res.setHeader("Set-Cookie", "access_token=; Max-Age=0; Path=/");
      if (req.url === "/api/media") {
        res.setHeader("Content-Type", "audio/webm");
        res.writeHead(206, { "Content-Range": "bytes 0-2/8" });
        return res.end(Buffer.from([0, 1, 255]));
      }
      res.end(JSON.stringify({ mode }));
    });
    app.listen(0, "127.0.0.1");
    await once(app, "listening");
    t.after(
      () =>
        new Promise((resolve) => {
          app.closeAllConnections();
          app.close(resolve);
        }),
    );
    return `http://127.0.0.1:${app.address().port}`;
  }
  const config = {
    urls: { local: await server("local"), online: await server("online") },
    defaultMode: "online",
  };
  const origin = "http://localhost:3001";
  const mixedCookies =
    "oral_backend=online; oral_online_access_token=online-secret; oral_local_access_token=local-secret; access_token=legacy-secret; unrelated=value";
  const request = (path, init = {}) =>
    new Request(origin + path, {
      ...init,
      headers: {
        origin,
        "x-oral-backend": "online",
        cookie: mixedCookies,
        ...init.headers,
      },
    });
  let response = await proxyBackend(
    request("/api/login", {
      method: "POST",
      body: "{}",
      headers: { "X-Oral-Client": "desktop" },
    }),
    config,
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.getSetCookie()[0],
    /^oral_online_access_token=online-access;/,
  );
  assert.match(response.headers.getSetCookie()[0], /Secure/);
  assert.doesNotMatch(response.headers.getSetCookie()[0], /Domain=/);
  assert.match(
    response.headers.getSetCookie()[1],
    /^oral_online_refresh_token=/,
  );
  assert.equal(calls.at(-1).headers.cookie, "access_token=online-secret");
  assert.equal(calls.at(-1).headers.origin, config.urls.online);
  assert.equal(calls.at(-1).headers["x-oral-backend"], undefined);
  assert.equal(calls.at(-1).headers["x-oral-client"], "desktop");

  response = await proxyBackend(
    request("/api/logout", { method: "POST" }),
    config,
  );
  assert.equal(
    response.headers.getSetCookie()[0],
    "oral_online_access_token=; Max-Age=0; Path=/",
  );
  response = await proxyBackend(
    request("/api/me", {
      headers: {
        cookie: mixedCookies.replace(
          "oral_backend=online",
          "oral_backend=local",
        ),
        "x-oral-backend": "local",
      },
    }),
    config,
  );
  assert.equal((await response.json()).mode, "local");
  assert.equal(calls.at(-1).headers.cookie, "access_token=local-secret");

  const before = calls.length;
  for (const headers of [
    { origin: "https://evil.test" },
    { origin: "null" },
    { "sec-fetch-site": "cross-site" },
    { "x-oral-backend": "local" },
    { "x-oral-backend": "" },
    { host: "evil.test:3001" },
  ]) {
    response = await proxyBackend(
      request("/api/login", { method: "POST", headers }),
      config,
    );
    assert.ok([403, 409].includes(response.status));
  }
  assert.equal(
    calls.length,
    before,
    "rejected requests never reach either server",
  );

  const audio = new Uint8Array([0, 255, 2, 7, 13, 10]);
  response = await proxyBackend(
    request("/api/upload?part=2", {
      method: "PUT",
      body: audio,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Chunk-Sha256": "hash",
      },
    }),
    config,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls.at(-1).body, Buffer.from(audio));
  assert.equal(calls.at(-1).url, "/api/upload?part=2");
  assert.equal(calls.at(-1).headers["x-chunk-sha256"], "hash");
  response = await proxyBackend(
    request("/api/media", { headers: { Range: "bytes=0-2" } }),
    config,
  );
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 0-2/8");
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    new Uint8Array([0, 1, 255]),
  );

  response = await switchBackend(
    request("/client-backend", {
      method: "POST",
      body: JSON.stringify({ mode: "local" }),
    }),
    config,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /^oral_backend=local;/);
  assert.equal(
    calls.at(-1).headers.cookie,
    undefined,
    "health check carries no login cookies",
  );
  response = await switchBackend(
    request("/client-backend", {
      method: "POST",
      body: JSON.stringify({ mode: "invalid" }),
    }),
    config,
  );
  assert.equal(response.status, 400);
  response = await switchBackend(
    request("/client-backend", {
      method: "POST",
      body: JSON.stringify({ mode: "local" }),
      headers: { origin: "https://evil.test" },
    }),
    config,
  );
  assert.equal(response.status, 403);
  const unavailable = {
    ...config,
    urls: { ...config.urls, local: "http://127.0.0.1:1" },
  };
  response = await switchBackend(
    request("/client-backend", {
      method: "POST",
      body: JSON.stringify({ mode: "local" }),
    }),
    unavailable,
  );
  assert.equal(response.status, 502);
  assert.equal(
    response.headers.get("set-cookie"),
    null,
    "failed switch keeps current backend",
  );
});
