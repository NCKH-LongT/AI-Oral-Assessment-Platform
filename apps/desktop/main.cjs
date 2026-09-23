const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  Menu,
  dialog,
  shell,
} = require("electron");
const { spawn } = require("node:child_process");
const {
  mkdtemp,
  writeFile,
  readFile,
  rename,
  rm,
} = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { installUnloadGuard } = require("./unload-guard.cjs");
const {
  DEFAULT_URL,
  normalizeServerURL,
  googleLoginURL,
  hasSameOrigin,
} = require("./server-config.cjs");
let webURL = new URL(DEFAULT_URL),
  sttBusy = false,
  win,
  configWindow;
let sttChild;
const configPage = pathToFileURL(path.join(__dirname, "server.html")).href;
function trustedConfig(event) {
  if (
    !configWindow ||
    event.sender !== configWindow.webContents ||
    event.senderFrame?.url !== configPage
  )
    throw new Error("Forbidden");
}
function showSettings() {
  if (configWindow) return configWindow.focus();
  configWindow = new BrowserWindow({
    width: 720,
    height: 540,
    title: "Cấu hình máy chủ",
    parent: win,
    webPreferences: {
      preload: path.join(__dirname, "server-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  configWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  configWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
  configWindow.on("closed", () => {
    configWindow = null;
    if (win && !win.isDestroyed() && !win.isVisible()) win.close();
  });
  void configWindow.loadFile(path.join(__dirname, "server.html"));
}
async function checkServer(value) {
  const origin = normalizeServerURL(value);
  const response = await fetch(origin + "/api/health", {
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!response.ok || (await response.json()).status !== "ok")
    throw new Error(
      "Máy chủ chưa sẵn sàng. Kiểm tra domain, HTTPS và backend.",
    );
  return origin;
}
app.whenReady().then(async () => {
  const configPath = path.join(app.getPath("userData"), "server.json");
  let configured = false;
  try {
    const stored = JSON.parse(await readFile(configPath, "utf8"));
    webURL = new URL(normalizeServerURL(stored.url));
    configured = true;
  } catch {}
  if (process.env.ORAL_WEB_URL) {
    try {
      webURL = new URL(normalizeServerURL(process.env.ORAL_WEB_URL));
      configured = true;
    } catch {
      configured = false;
    }
  }
  // The source launcher proxies a separate backend through the local dev UI.
  // Only an explicit development launch can set a different login origin.
  let authOrigin = webURL.origin;
  if (
    !app.isPackaged &&
    configured &&
    process.env.ORAL_WEB_URL &&
    process.env.ORAL_AUTH_ORIGIN
  )
    authOrigin = normalizeServerURL(process.env.ORAL_AUTH_ORIGIN);
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      callback(
        permission === "media" &&
          contents === win?.webContents &&
          hasSameOrigin(
            details.requestingUrl || contents?.getURL(),
            webURL.origin,
          ),
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, origin) =>
      permission === "media" &&
      contents === win?.webContents &&
      hasSameOrigin(origin, webURL.origin),
  );
  win = new BrowserWindow({
    show: configured || !app.isPackaged,
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
  installUnloadGuard(win, dialog);
  win.on("closed", () => {
    sttChild?.kill();
    configWindow?.destroy();
  });
  function trustedStudent(event) {
    if (
      event.sender !== win.webContents ||
      !hasSameOrigin(event.senderFrame?.url, webURL.origin)
    )
      throw new Error("Forbidden");
  }
  ipcMain.handle("oral:quit", (event) => {
    trustedStudent(event);
    // Let the IPC response finish; app.quit still respects the unload guard.
    setImmediate(() => app.quit());
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "OralAI",
        submenu: [
          { label: "Cấu hình máy chủ…", click: showSettings },
          { label: "Thoát ứng dụng", role: "quit" },
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
    ]),
  );
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== webURL.origin) event.preventDefault();
  });
  win.webContents.on(
    "did-fail-load",
    (event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) showSettings();
    },
  );
  ipcMain.handle("server:read", (event) => {
    trustedConfig(event);
    return webURL.origin;
  });
  ipcMain.handle("server:test", async (event, value) => {
    trustedConfig(event);
    await checkServer(value);
    return { message: "Kết nối thành công." };
  });
  ipcMain.handle("server:save", async (event, value) => {
    trustedConfig(event);
    if (sttBusy)
      throw new Error(
        "Đang xử lý local. Vui lòng chờ hoàn tất trước khi đổi máy chủ.",
      );
    const origin = await checkServer(value);
    const choice = await dialog.showMessageBox(configWindow, {
      type: "question",
      buttons: ["Hủy", "Đổi máy chủ"],
      defaultId: 0,
      cancelId: 0,
      message: "Đổi máy chủ và tải lại ứng dụng?",
      detail:
        "Hãy nộp xong bài đang làm. Bản ghi chưa nộp sẽ không được chuyển sang máy chủ mới.",
    });
    if (choice.response !== 1)
      return { message: "Giữ nguyên máy chủ hiện tại." };
    const temporary = configPath + ".tmp";
    await writeFile(temporary, JSON.stringify({ url: origin }), {
      mode: 0o600,
    });
    await rename(temporary, configPath);
    await session.defaultSession.clearStorageData({ origin: webURL.origin });
    webURL = new URL(origin);
    authOrigin = origin;
    await win.loadURL(webURL.href);
    win.show();
    configWindow?.close();
    return { message: "Đã lưu máy chủ." };
  });
  ipcMain.handle("oral:google", async (event, value) => {
    if (
      event.sender !== win.webContents ||
      !event.senderFrame ||
      (event.senderFrame?.url &&
        new URL(event.senderFrame.url).origin !== webURL.origin)
    )
      throw new Error("Forbidden");
    await shell.openExternal(googleLoginURL(value, authOrigin));
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
    let folder;
    try {
      folder = await mkdtemp(path.join(tmpdir(), "oral-stt-"));
      const audioPath = path.join(folder, "answer.webm");
      await writeFile(audioPath, Buffer.from(buffer), { mode: 0o600 });
      return await new Promise((resolve, reject) => {
        const bundled = path.join(
          app.isPackaged
            ? process.resourcesPath
            : path.join(__dirname, "resources"),
          "stt",
          "oral-stt",
          process.platform === "win32" ? "oral-stt.exe" : "oral-stt",
        );
        const pythonScript = app.isPackaged
          ? path.join(process.resourcesPath, "python", "transcribe.py")
          : path.join(__dirname, "transcribe.py");
        const useBundle = existsSync(bundled) && !process.env.ORAL_PYTHON;
        if (app.isPackaged && !useBundle && !process.env.ORAL_PYTHON) {
          reject(
            new Error(
              "Bộ cài thiếu STT local. Cài lại bản OralAI đầy đủ có PhoWhisper.",
            ),
          );
          return;
        }
        const child = spawn(
          useBundle
            ? bundled
            : process.env.ORAL_PYTHON ||
                (process.platform === "win32" ? "python" : "python3"),
          useBundle ? [audioPath] : [pythonScript, audioPath],
          {
            shell: false,
            windowsHide: true,
            env: {
              ...process.env,
              ORAL_STT_MODEL:
                process.env.ORAL_STT_MODEL ||
                path.join(
                  app.isPackaged
                    ? process.resourcesPath
                    : path.join(__dirname, "resources"),
                  "stt",
                  "model",
                ),
              HF_HUB_OFFLINE: "1",
              STT_LANGUAGE: policy.language,
            },
          },
        );
        sttChild = child;
        let output = "",
          error = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(
            new Error(
              "STT local quá thời gian xử lý. Thử câu trả lời ngắn hơn và đóng ứng dụng đang dùng nhiều CPU.",
            ),
          );
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
          reject(
            new Error(
              useBundle
                ? "Không khởi động được STT local. Cài lại bộ OralAI đầy đủ."
                : "Không tìm thấy Python. Kiểm tra ORAL_PYTHON.",
            ),
          );
        });
        child.on("close", (code) => {
          if (sttChild === child) sttChild = null;
          clearTimeout(timer);
          if (code !== 0)
            return reject(
              new Error(
                "STT local thất bại. Kiểm tra mic, giới hạn 10 phút mỗi câu hoặc cài lại bộ OralAI đầy đủ.",
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
      if (folder) await rm(folder, { recursive: true, force: true });
    }
  });
  if (configured || !app.isPackaged)
    void win.loadURL(webURL.href).catch(() => {});
  else {
    await win.loadURL("about:blank");
    showSettings();
  }
});
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  sttChild?.kill();
});
