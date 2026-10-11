const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "oralDesktop",
  Object.freeze({
    openGoogle: (url) => ipcRenderer.invoke("oral:google", url),
    focus: () => ipcRenderer.invoke("oral:focus"),
    settings: () => ipcRenderer.invoke("oral:settings"),
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
