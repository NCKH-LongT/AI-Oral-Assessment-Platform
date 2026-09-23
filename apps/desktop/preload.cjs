const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "oralDesktop",
  Object.freeze({
    openGoogle: (url) => ipcRenderer.invoke("oral:google", url),
    quit: () => ipcRenderer.invoke("oral:quit"),
    transcribe: (audio, policy) =>
      ipcRenderer.invoke("oral:transcribe", audio, policy),
  }),
);
