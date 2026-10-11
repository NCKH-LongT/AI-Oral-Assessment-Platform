const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "oralDesktop",
  Object.freeze({
    openGoogle: (url) => ipcRenderer.invoke("oral:google", url),
    focus: () => ipcRenderer.invoke("oral:focus"),
    settings: () => ipcRenderer.invoke("oral:settings"),
    beginExam: () => ipcRenderer.invoke("oral:exam-begin"),
    endExam: () => ipcRenderer.invoke("oral:exam-end"),
    onExamEvent: (callback) => {
      const listener = (_event, type) => callback(type);
      ipcRenderer.on("oral:exam-event", listener);
      return () => ipcRenderer.removeListener("oral:exam-event", listener);
    },
    quit: () => ipcRenderer.invoke("oral:quit"),
    sttModels: () => ipcRenderer.invoke("oral:stt-models"),
    transcribe: (audio, policy) =>
      ipcRenderer.invoke("oral:transcribe", audio, policy),
  }),
);
