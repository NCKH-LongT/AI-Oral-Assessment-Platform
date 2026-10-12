// Local source UI with a Local / Online backend picker, on Windows/macOS/Linux.
const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { parseEnv } = require("node:util");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");

async function main() {
  const file = path.join(ROOT, ".env");
  const settings = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const env = { ...process.env, ORAL_CLIENT_ENABLED: "1" };
  // Do not pass backend secrets from .env into the local frontend.
  for (const key of [
    "ORAL_BACKEND_MODE",
    "ORAL_LOCAL_BACKEND_URL",
    "ORAL_ONLINE_BACKEND_URL",
    "ORAL_CLIENT_PORT",
    "ORAL_PYTHON",
  ])
    if (!env[key] && settings[key]) env[key] = settings[key];
  const { backendConfig } =
    await import("../apps/admin-web/lib/client-backend.mjs");
  const config = backendConfig(env);
  const port = Number(env.ORAL_CLIENT_PORT || 3001);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("ORAL_CLIENT_PORT phải từ 1024 đến 65535.");
  const origin = `http://localhost:${port}`;
  if (
    Object.values(config.urls).some((value) => {
      const url = new URL(value);
      return (
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        Number(url.port) === port
      );
    })
  )
    throw new Error("Cổng giao diện local không được trùng cổng backend.");
  Object.assign(env, {
    ORAL_WEB_URL: origin,
    ORAL_AUTH_ORIGIN: config.urls[config.defaultMode],
    ORAL_BACKEND_MODE: config.defaultMode,
    ORAL_LOCAL_BACKEND_URL: config.urls.local,
    ORAL_ONLINE_BACKEND_URL: config.urls.online,
  });
  delete env.ELECTRON_RUN_AS_NODE;
  const python = path.join(
    ROOT,
    ".venv-stt",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  if (!env.ORAL_PYTHON && existsSync(python)) env.ORAL_PYTHON = python;
  const desktop = process.argv.includes("--desktop");
  const children = [];
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    for (const child of children.reverse()) {
      if (child.exitCode !== null) continue;
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } else {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {}
      }
    }
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  function start(command, args, cwd = ROOT) {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: command === process.execPath,
      detached: process.platform !== "win32",
    });
    children.push(child);
    child.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
      stop();
    });
    return child;
  }
  async function running() {
    try {
      const response = await fetch(origin + "/client-backend", {
        signal: AbortSignal.timeout(2000),
      });
      const current = await response.json();
      if (
        !current.enabled ||
        JSON.stringify(current.urls) !== JSON.stringify(config.urls) ||
        current.defaultMode !== config.defaultMode
      )
        throw new Error(
          "Cổng giao diện đang dùng cấu hình khác. Đóng phiên cũ hoặc đổi ORAL_CLIENT_PORT.",
        );
      return true;
    } catch (error) {
      if (error.message.startsWith("Cổng giao diện")) throw error;
      return false;
    }
  }
  try {
    const reuse = await running();
    let web;
    if (reuse && !desktop) throw new Error(`Giao diện đã chạy tại ${origin}.`);
    if (!reuse) {
      await new Promise((resolve, reject) => {
        const copy = start(process.execPath, [
          "apps/admin-web/scripts/copy-audio-assets.mjs",
        ]);
        copy.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error("Không chuẩn bị được audio assets.")),
        );
      });
      web = start(
        process.execPath,
        [
          require.resolve("next/dist/bin/next"),
          "dev",
          "--webpack",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(port),
        ],
        path.join(ROOT, "apps/admin-web"),
      );
      web.on("exit", (code) => {
        if (!stopping) {
          process.exitCode = code || 0;
          stop();
        }
      });
      const deadline = Date.now() + 90000;
      while (!(await running())) {
        if (web.exitCode !== null || stopping)
          throw new Error("Giao diện local đã dừng.");
        if (Date.now() > deadline)
          throw new Error("Hết thời gian chờ giao diện local.");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    console.log(
      `\nWeb local: ${origin}\nChọn Local (${config.urls.local}) / Online (${config.urls.online}) ở đầu giao diện.\n`,
    );
    if (desktop) {
      const electron = start(require("electron"), [
        path.join(ROOT, "apps/desktop"),
        `--user-data-dir=${path.join(ROOT, ".data", "desktop-client-profile")}`,
      ]);
      electron.on("exit", (code) => {
        process.exitCode = code || 0;
        stop();
      });
    }
  } catch (error) {
    stop();
    throw error;
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
