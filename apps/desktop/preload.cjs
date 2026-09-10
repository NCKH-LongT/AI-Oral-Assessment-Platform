const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "oralDesktop",
  Object.freeze({
    transcribe: (audio) => ipcRenderer.invoke("oral:transcribe", audio),
  }),
);
