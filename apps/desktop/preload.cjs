const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "oralDesktop",
  Object.freeze({
    transcribe: (audio, policy) =>
      ipcRenderer.invoke("oral:transcribe", audio, policy),
  }),
);
