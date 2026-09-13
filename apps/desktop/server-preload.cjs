const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "serverSettings",
  Object.freeze({
    read: () => ipcRenderer.invoke("server:read"),
    test: (url) => ipcRenderer.invoke("server:test", url),
    save: (url) => ipcRenderer.invoke("server:save", url),
  }),
);
