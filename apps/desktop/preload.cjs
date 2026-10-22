const { contextBridge, ipcRenderer } = require("electron");
if (location.protocol === "file:" && location.pathname.endsWith("/setup.html")) {
  contextBridge.exposeInMainWorld("oralSetup", Object.freeze({
    status: () => ipcRenderer.invoke("setup:status"),
    start: () => ipcRenderer.invoke("setup:start"),
    onProgress: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("setup:progress", listener);
      return () => ipcRenderer.removeListener("setup:progress", listener);
    },
  }));
}
async function invokeDisplay(channel, ...args) {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    throw new Error(
      error.message.replace(
        /^Error invoking remote method 'oral:[^']+': (?:Error: )?/,
        "",
      ),
    );
  }
}
contextBridge.exposeInMainWorld(
  "oralDesktop",
  Object.freeze({
    openGoogle: (url) => ipcRenderer.invoke("oral:google", url),
    focus: () => ipcRenderer.invoke("oral:focus"),
    settings: () => ipcRenderer.invoke("oral:settings"),
    displayStatus: () => invokeDisplay("oral:displays-status"),
    useSingleDisplay: (keep) => invokeDisplay("oral:displays-single", keep),
    restoreDisplays: () => invokeDisplay("oral:displays-restore"),
    beginExam: async () => {
      try {
        await ipcRenderer.invoke("oral:exam-begin");
      } catch (error) {
        throw new Error(
          error.message.replace(
            /^Error invoking remote method 'oral:exam-begin': (?:Error: )?/,
            "",
          ),
        );
      }
    },
    endExam: (options) => ipcRenderer.invoke("oral:exam-end", options),
    onExamEvent: (callback) => {
      const listener = (_event, type) => callback(type);
      ipcRenderer.on("oral:exam-event", listener);
      return () => ipcRenderer.removeListener("oral:exam-event", listener);
    },
    quit: () => ipcRenderer.invoke("oral:quit"),
    downloadModel: (backendMode) => ipcRenderer.invoke("oral:download-model", backendMode),
    sttModels: () => ipcRenderer.invoke("oral:stt-models"),
    transcribe: (audio, policy) =>
      ipcRenderer.invoke("oral:transcribe", audio, policy),
  }),
);
