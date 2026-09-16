const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "oralDesktop",
  Object.freeze({
    openGoogle: (url) => ipcRenderer.invoke("oral:google", url),
    correction: Object.freeze({
      status: () => ipcRenderer.invoke("oral:correction-status"),
      install: () => ipcRenderer.invoke("oral:correction-install"),
      cancel: () => ipcRenderer.invoke("oral:correction-cancel"),
      suggest: (text) => ipcRenderer.invoke("oral:correct", text),
    }),
    transcribe: (audio, policy) =>
      ipcRenderer.invoke("oral:transcribe", audio, policy),
  }),
);
