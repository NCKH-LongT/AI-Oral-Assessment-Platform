// Only the loopback client launcher enables this proxy. Docker uses its normal API.
export const MODE_COOKIE = "oral_backend";
export const MODE_HEADER = "x-oral-backend";
const modes = ["local", "online"];

export function backendConfig(env = process.env) {
  if (env.ORAL_CLIENT_ENABLED !== "1") return null;
  const urls = {
    local: env.ORAL_LOCAL_BACKEND_URL || "http://localhost:3000",
    online: env.ORAL_ONLINE_BACKEND_URL || "https://oral-test.paperlens.uk",
  };
  for (const [mode, value] of Object.entries(urls)) {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    )
      throw new Error(
        `ORAL_${mode.toUpperCase()}_BACKEND_URL cần domain gốc HTTPS hoặc HTTP localhost.`,
      );
    urls[mode] = url.origin;
  }
  const defaultMode = env.ORAL_BACKEND_MODE || "online";
  if (!modes.includes(defaultMode))
    throw new Error("ORAL_BACKEND_MODE phải là local hoặc online.");
  return { urls, defaultMode };
}

function cookies(request) {
  return (request.headers.get("cookie") || "")
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function selectedMode(request, config) {
  const mode = cookies(request)
    .find((v) => v.startsWith(MODE_COOKIE + "="))
    ?.slice(MODE_COOKIE.length + 1);
  return modes.includes(mode) ? mode : config.defaultMode;
}

function error(message, status) {
  return Response.json(
    { error: { message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

// Validate the browser boundary BEFORE translating Origin for the selected server.
// No external website may use the local client to forward authenticated mutations.
function trustedRequest(request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    (host && host !== url.host)
  )
    return false;
  const origin = request.headers.get("origin");
  return (
    (!origin || origin === url.origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}

export async function switchBackend(request, config = backendConfig()) {
  if (!config) return error("Chỉ dùng trong ứng dụng local.", 404);
  if (
    !trustedRequest(request) ||
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return error("Origin không được phép.", 403);
  const body = await request.json().catch(() => null);
  if (!modes.includes(body?.mode)) return error("Chọn Local hoặc Online.", 400);
  try {
    const health = await fetch(config.urls[body.mode] + "/api/health", {
      signal: AbortSignal.timeout(8000),
      redirect: "error",
      cache: "no-store",
    });
    if (!health.ok || (await health.json()).status !== "ok") throw new Error();
  } catch {
    return error(
      `Không kết nối được backend ${body.mode}. ${body.mode === "local" ? "Hãy chạy server local trước." : "Kiểm tra kết nối Internet và máy chủ."}`,
      502,
    );
  }
  return Response.json(
    { mode: body.mode },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `${MODE_COOKIE}=${body.mode}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`,
      },
    },
  );
}

export async function proxyBackend(request, config = backendConfig()) {
  if (!config) return error("Chỉ dùng trong ứng dụng local.", 404);
  if (!trustedRequest(request)) return error("Origin không được phép.", 403);
  const mode = selectedMode(request, config);
  const requestedMode = request.headers.get(MODE_HEADER);
  if (requestedMode && requestedMode !== mode)
    return error("Backend đã đổi ở tab khác. Tải lại trang để tiếp tục.", 409);
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    requestedMode !== mode
  )
    return error("Thiếu chế độ backend. Tải lại trang để tiếp tục.", 409);
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/"))
    return error("Đường dẫn không hợp lệ.", 400);
  const target = new URL(config.urls[mode]);
  target.pathname = url.pathname;
  target.search = url.search;
  const prefix = `oral_${mode}_`;
  const headers = new Headers();
  for (const name of [
    "content-type",
    "accept",
    "range",
    "if-range",
    "idempotency-key",
    "x-chunk-sha256",
    "x-oral-client",
  ])
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  const scopedCookies = cookies(request)
    .filter((v) => v.startsWith(prefix))
    .map((v) => v.slice(prefix.length));
  if (scopedCookies.length) headers.set("cookie", scopedCookies.join("; "));
  headers.set("origin", target.origin);
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      // Node fetch streams uploads without buffering recordings in memory.
      duplex: "half",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(300000)]),
    });
    const responseHeaders = new Headers();
    for (const name of [
      "content-type",
      "content-disposition",
      "content-range",
      "accept-ranges",
      "x-request-id",
      "retry-after",
    ])
      if (upstream.headers.has(name))
        responseHeaders.set(name, upstream.headers.get(name));
    responseHeaders.set("Cache-Control", "no-store");
    for (const cookie of upstream.headers.getSetCookie()) {
      // Cookies from the two servers never overwrite or reach one another.
      // Secure cookies stay Secure (Chromium supports them on localhost).
      responseHeaders.append(
        "Set-Cookie",
        prefix + cookie.replace(/;\s*Domain=[^;]*/gi, ""),
      );
    }
    if (upstream.headers.has("location")) {
      const location = new URL(upstream.headers.get("location"), target);
      responseHeaders.set(
        "location",
        location.origin === target.origin
          ? location.pathname + location.search + location.hash
          : location.href,
      );
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (cause) {
    const requestId = crypto.randomUUID();
    const timedOut = cause?.name === "TimeoutError";
    const code = timedOut ? "BACKEND_TIMEOUT" : "BACKEND_UNREACHABLE";
    // Log routing/transport metadata only, never credentials or answer bodies.
    console.warn("oral_backend_request_failed", {
      request_id: requestId,
      mode,
      method: request.method,
      path: url.pathname,
      code: cause?.cause?.code || cause?.code || cause?.name || "UNKNOWN",
    });
    return Response.json(
      {
        error: {
          code,
          message: timedOut
            ? `Server ${mode} phản hồi quá lâu. Kiểm tra mạng rồi thử lại.`
            : `Kết nối tới server ${mode} bị gián đoạn. Kiểm tra mạng rồi thử lại.`,
          details: { request_id: requestId },
        },
      },
      {
        status: timedOut ? 504 : 502,
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      },
    );
  }
}
