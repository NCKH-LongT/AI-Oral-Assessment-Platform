const { app, BrowserWindow, ipcMain, session } = require("electron");
const { spawn } = require("node:child_process");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const webURL = new URL(process.env.ORAL_WEB_URL || "http://localhost:3000");
if (
  webURL.protocol !== "https:" &&
  !(
    webURL.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(webURL.hostname)
  )
) {
  throw new Error("ORAL_WEB_URL must use HTTPS, except localhost development");
}
let sttBusy = false;
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) => {
      callback(
        permission === "media" &&
          new URL(contents.getURL()).origin === webURL.origin,
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, origin) => {
      return permission === "media" && origin === webURL.origin;
    },
  );
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== webURL.origin) event.preventDefault();
  });
  ipcMain.handle("oral:transcribe", async (event, buffer, policy) => {
    if (
      !event.senderFrame ||
      new URL(event.senderFrame.url).origin !== webURL.origin ||
      !(buffer instanceof ArrayBuffer) ||
      buffer.byteLength > 30 * 1024 * 1024 ||
      !buffer.byteLength ||
      !policy ||
      policy.provider !== "local" ||
      !["off", "denoise"].includes(policy.preprocessing) ||
      !["vi", "en"].includes(policy.language)
    )
      throw new Error("Invalid STT request");
    if (sttBusy) throw new Error("STT đang bận");
    sttBusy = true;
    const folder = await mkdtemp(path.join(tmpdir(), "oral-stt-"));
    try {
      const audioPath = path.join(folder, "answer.webm");
      await writeFile(audioPath, Buffer.from(buffer), { mode: 0o600 });
      return await new Promise((resolve, reject) => {
        const child = spawn(
          process.env.ORAL_PYTHON || "python3",
          [path.join(__dirname, "transcribe.py"), audioPath],
          {
            shell: false,
            windowsHide: true,
            env: {
              ...process.env,
              STT_MODEL: process.env.STT_MODEL || "base",
              STT_LANGUAGE: policy.language,
              STT_PREPROCESSING: policy.preprocessing,
            },
          },
        );
        let output = "",
          error = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("STT timeout. Thử model nhỏ hơn."));
        }, 420000);
        child.stdout.on("data", (data) => {
          output += data;
          if (output.length > 1000000) child.kill();
        });
        child.stderr.on("data", (data) => {
          error += data;
          if (error.length > 100000) error = error.slice(-10000);
        });
        child.on("error", () => {
          clearTimeout(timer);
          reject(new Error("Không tìm thấy Python. Kiểm tra ORAL_PYTHON."));
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code !== 0)
            return reject(
              new Error(
                "STT local thất bại. Kiểm tra FFmpeg, faster-whisper, model và giới hạn 10 phút mỗi câu.",
              ),
            );
          try {
            resolve(JSON.parse(output));
          } catch {
            reject(new Error("STT output không hợp lệ"));
          }
        });
      });
    } finally {
      sttBusy = false;
      await rm(folder, { recursive: true, force: true });
    }
  });
  win.loadURL(webURL.href);
});
app.on("window-all-closed", () => app.quit());
