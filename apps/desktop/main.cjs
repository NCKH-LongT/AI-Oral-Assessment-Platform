const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  Menu,
  dialog,
  shell,
  screen,
  desktopCapturer,
} = require("electron");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
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
const { installExamLock } = require("./exam-lock.cjs");
const { createDisplayManager } = require("./display-manager.cjs");
const { createModelInstaller } = require("./model-installer.cjs");
const downloadModel = require("./package.json").modelDownloadOnFirstRun || process.env.ORAL_MODEL_DOWNLOAD === "1";
let modelInstaller;
const {
  validHotwords,
  validModel,
  STT_MODELS,
  inspectSttModels,
  missingModelResult,
} = require("./stt-policy.cjs");
const runFile = promisify(execFile);
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on("second-instance", () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

function sttRoot() {
  return path.join(
    app.isPackaged ? process.resourcesPath : path.join(__dirname, "resources"),
    "stt",
  );
}
function sttModelPath(model) {
  return (
    process.env.ORAL_WHISPER_MODEL ||
    (downloadModel && modelInstaller?.target) ||
    path.join(sttRoot(), STT_MODELS[model].folder)
  );
}
function sttCommand() {
  const bundled = path.join(
    sttRoot(),
    "oral-stt",
    process.platform === "win32" ? "oral-stt.exe" : "oral-stt",
  );
  if (existsSync(bundled) && !process.env.ORAL_PYTHON)
    return { command: bundled, args: [], bundled: true };
  if (app.isPackaged && !process.env.ORAL_PYTHON)
    throw new Error("Bộ cài thiếu STT local. Cài lại OralAI đầy đủ.");
  return {
    command:
      process.env.ORAL_PYTHON ||
      (process.platform === "win32" ? "python" : "python3"),
    args: [
      app.isPackaged
        ? path.join(process.resourcesPath, "python", "transcribe.py")
        : path.join(__dirname, "transcribe.py"),
    ],
    bundled: false,
  };
}
async function checkSttRuntime() {
  const helper = sttCommand();
  try {
    const { stdout } = await runFile(
      helper.command,
      [...helper.args, "--capabilities"],
      { timeout: 15000, windowsHide: true },
    );
    const capabilities = JSON.parse(stdout);
    if (
      capabilities.protocol !== 2 ||
      !capabilities.hotwords ||
      !Object.keys(STT_MODELS).every((key) =>
        capabilities.models?.includes(key),
      ) ||
      !["vi", "en"].every((language) =>
        capabilities.languages?.includes(language),
      )
    )
      throw new Error("Old runtime");
  } catch {
    throw new Error(
      "Bộ STT local chưa hỗ trợ chọn model/ngôn ngữ. Build lại runtime STT hoặc cài bản OralAI mới.",
    );
  }
  return helper;
}
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
let examLock;
let examBeginGeneration = 0;
let displayManager;
let quitRestoreStarted = false;
let restoreWarning = "";

async function restoreDisplays() {
  try {
    await displayManager?.restore();
    restoreWarning = "";
  } catch (error) {
    if (restoreWarning !== error.message) {
      restoreWarning = error.message;
      await dialog.showMessageBox({
        type: "warning",
        title: "Khôi phục màn hình",
        message: "Chưa khôi phục được cấu hình màn hình trước khi thi.",
        detail:
          error.message +
          " Cấu hình cũ vẫn được lưu; bạn có thể thử lại trong OralAI hoặc mở Cài đặt màn hình.",
      });
    }
  }
}
const configPage = pathToFileURL(path.join(__dirname, "server.html")).href;
const setupPage = pathToFileURL(path.join(__dirname, "setup.html")).href;
function trustedConfig(event) {
  if (
    !configWindow ||
    event.sender !== configWindow.webContents ||
    event.senderFrame?.url !== configPage
  )
    throw new Error("Forbidden");
}
function showSettings() {
  if (examLock?.active) return;
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
      devTools: false,
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
  if (!primaryInstance) return;
  const configPath = path.join(app.getPath("userData"), "server.json");
  let configured = true;
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
        (permission === "media" ||
          (permission === "display-capture" && examLock?.active)) &&
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
      (permission === "media" ||
        (permission === "display-capture" && examLock?.active)) &&
      contents === win?.webContents &&
      hasSameOrigin(origin, webURL.origin),
  );
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    show: configured || !app.isPackaged,
    width: Math.min(1360, area.width),
    height: Math.min(900, area.height),
    minWidth: Math.min(800, area.width),
    minHeight: Math.min(580, area.height),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      spellcheck: false,
    },
  });
  const desktopCSS = await readFile(path.join(__dirname, "desktop.css"), "utf8");
  win.webContents.on("dom-ready", () => {
    if (hasSameOrigin(win.webContents.getURL(), webURL.origin))
      void win.webContents.insertCSS(desktopCSS, { cssOrigin: "user" }).catch(console.error);
  });
  if (downloadModel) {
    modelInstaller = createModelInstaller({
      directory: path.join(app.getPath("userData"), "stt"),
      license: path.join(sttRoot(), "WHISPER-LICENSE.txt"),
      onProgress: (state) => {
        if (!win.isDestroyed() && win.webContents.getURL() === setupPage)
          win.webContents.send("setup:progress", state);
      },
    });
    function trustedSetup(event) {
      if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== setupPage)
        throw new Error("Forbidden");
    }
    ipcMain.handle("setup:status", (event) => { trustedSetup(event); return modelInstaller.status(); });
    ipcMain.handle("setup:start", async (event) => {
      trustedSetup(event);
      await modelInstaller.start();
      const helper = await checkSttRuntime();
      try {
        await runFile(helper.command, [...helper.args, "--check"], {
          timeout: 60000,
          windowsHide: true,
          env: { ...process.env, ORAL_STT_MODEL: modelInstaller.target, HF_HUB_OFFLINE: "1" },
        });
      } catch {
        throw new Error("Chưa nạp được model. Thử lại hoặc cài lại OralAI nếu lỗi tiếp tục.");
      }
      setImmediate(() => { if (!win.isDestroyed()) void win.loadURL(webURL.href).catch(() => {}); });
      return { ready: true };
    });
  }
  installUnloadGuard(win, dialog);
  examLock = installExamLock(win, { screen });
  displayManager = createDisplayManager({ directory: app.getPath("userData") });
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (
      hasSameOrigin(details.url, webURL.origin) &&
      new URL(details.url).pathname.startsWith("/api/")
    )
      headers["X-Oral-Client"] = "desktop";
    callback({ requestHeaders: headers });
  });
  session.defaultSession.on("will-download", (event) => {
    if (examLock.active) event.preventDefault();
  });
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      if (
        !examLock.active ||
        request.frame !== win.webContents.mainFrame ||
        !hasSameOrigin(request.securityOrigin, webURL.origin)
      )
        return callback({});
      const generation = examBeginGeneration;
      let timer;
      try {
        const sources = await Promise.race([
          desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 0, height: 0 },
          }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Screen capture timed out")),
              20000,
            );
          }),
        ]);
        if (
          !examLock.active ||
          generation !== examBeginGeneration ||
          win.isDestroyed() ||
          request.frame !== win.webContents.mainFrame ||
          !hasSameOrigin(request.securityOrigin, webURL.origin) ||
          sources.length !== 1
        )
          return callback({});
        callback({ video: sources[0] });
      } catch {
        callback({});
      } finally {
        clearTimeout(timer);
      }
    },
  );
  win.on("closed", () => {
    modelInstaller?.cancel();
    sttChild?.kill();
    configWindow?.destroy();
  });
  function trustedStudent(event) {
    if (
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame ||
      !hasSameOrigin(event.senderFrame?.url, webURL.origin)
    )
      throw new Error("Forbidden");
  }
  ipcMain.handle("oral:quit", (event) => {
    trustedStudent(event);
    // Let the IPC response finish; app.quit still respects the unload guard.
    setImmediate(() => app.quit());
  });
  ipcMain.handle("oral:focus", (event) => {
    trustedStudent(event);
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  ipcMain.handle("oral:settings", (event) => {
    trustedStudent(event);
    showSettings();
  });
  ipcMain.handle("oral:exam-begin", async (event) => {
    trustedStudent(event);
    const generation = ++examBeginGeneration;
    await displayManager.idle();
    if (generation !== examBeginGeneration)
      throw new Error("Đã hủy khôi phục chế độ thi. Bạn có thể thử lại.");
    await examLock.begin();
  });
  ipcMain.handle("oral:exam-end", async (event, options) => {
    trustedStudent(event);
    examBeginGeneration++;
    examLock.end();
    // Failed/cancelled capture must unlock controls without undoing the
    // single-display setup needed by the next recovery attempt.
    if (options?.restoreDisplays !== false) await restoreDisplays();
  });
  ipcMain.handle("oral:displays-status", (event) => {
    trustedStudent(event);
    return displayManager.status();
  });
  ipcMain.handle("oral:displays-single", async (event, keep) => {
    trustedStudent(event);
    if (examLock.active)
      win.webContents.send("oral:exam-event", "DISPLAY_CHANGED");
    examLock.end();
    const result = await displayManager.single(keep);
    // Mutter can return before Electron receives its display-change event.
    const deadline = Date.now() + 3000;
    while (screen.getAllDisplays().length !== 1 && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (screen.getAllDisplays().length !== 1)
      throw new Error(
        "Hệ điều hành đã đổi cấu hình nhưng ứng dụng chưa nhận đủ cập nhật. Bấm Kiểm tra lại màn hình rồi thử lại.",
      );
    win.show();
    win.focus();
    return result;
  });
  ipcMain.handle("oral:displays-restore", async (event) => {
    trustedStudent(event);
    if (examLock.active)
      throw new Error("Kết thúc bài thi trước khi khôi phục các màn hình.");
    await displayManager.restore();
    return displayManager.status();
  });
  Menu.setApplicationMenu(null);
  win.setMenu(null);
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
    if (examLock.active) throw new Error("Không mở đăng nhập trong khi thi.");
    if (
      event.sender !== win.webContents ||
      !event.senderFrame ||
      (event.senderFrame?.url &&
        new URL(event.senderFrame.url).origin !== webURL.origin)
    )
      throw new Error("Forbidden");
    let selectedAuthOrigin = authOrigin;
    if (
      !app.isPackaged &&
      process.env.ORAL_CLIENT_ENABLED === "1" &&
      webURL.origin === process.env.ORAL_WEB_URL
    ) {
      const saved = await session.defaultSession.cookies.get({
        url: webURL.origin,
        name: "oral_backend",
      });
      const mode = saved[0]?.value || process.env.ORAL_BACKEND_MODE || "online";
      selectedAuthOrigin = normalizeServerURL(
        mode === "local"
          ? process.env.ORAL_LOCAL_BACKEND_URL || "http://localhost:3000"
          : process.env.ORAL_ONLINE_BACKEND_URL ||
              "https://oral-test.paperlens.uk",
      );
    }
    await shell.openExternal(googleLoginURL(value, selectedAuthOrigin));
  });
  ipcMain.handle("oral:stt-models", async (event) => {
    if (
      event.sender !== win.webContents ||
      !event.senderFrame ||
      new URL(event.senderFrame.url).origin !== webURL.origin
    )
      throw new Error("Forbidden");
    return inspectSttModels(sttModelPath, existsSync, checkSttRuntime);
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
      !["vi", "en"].includes(policy.language) ||
      (policy.desktop_model !== undefined &&
        !validModel(policy.desktop_model)) ||
      !validHotwords(policy.hotwords)
    )
      throw new Error("Invalid STT request");
    if (sttBusy) throw new Error("STT đang bận");
    sttBusy = true;
    let folder;
    try {
      const selected = policy.desktop_model || "whisper-small";
      const modelPath = sttModelPath(selected);
      if (!existsSync(path.join(modelPath, "model.bin")))
        return missingModelResult();
      const helper = await checkSttRuntime();
      folder = await mkdtemp(path.join(tmpdir(), "oral-stt-"));
      const audioPath = path.join(folder, "answer.webm");
      await writeFile(audioPath, Buffer.from(buffer), { mode: 0o600 });
      return await new Promise((resolve, reject) => {
        const child = spawn(helper.command, [...helper.args, audioPath], {
          shell: false,
          windowsHide: true,
          env: {
            ...process.env,
            ORAL_STT_MODEL: modelPath,
            ORAL_STT_VARIANT: selected,
            HF_HUB_OFFLINE: "1",
            STT_LANGUAGE: policy.language,
            STT_HOTWORDS: JSON.stringify(policy.hotwords || []),
          },
        });
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
              helper.bundled
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
  if (downloadModel && !(await modelInstaller.ready()))
    await win.loadURL(setupPage);
  else if (configured || !app.isPackaged)
    void win.loadURL(webURL.href).catch(() => {});
  else {
    await win.loadURL("about:blank");
    showSettings();
  }
});
app.on("window-all-closed", () => app.quit());
app.on("will-quit", (event) => {
  sttChild?.kill();
  // will-quit runs only after the window's leave/stay guard has accepted exit.
  if (displayManager && !quitRestoreStarted) {
    event.preventDefault();
    quitRestoreStarted = true;
    void restoreDisplays().finally(() => app.quit());
  }
});
