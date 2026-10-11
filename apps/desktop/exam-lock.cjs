// Application-level restrictions. OS shortcuts / a modified client are not a
// security boundary; incidents are evidence for review, not proof of cheating.
function installExamLock(win, { screen }) {
  let active = false;
  const report = (type) => {
    if (active && !win.isDestroyed())
      win.webContents.send("oral:exam-event", type);
  };
  win.webContents.on("before-input-event", (event, input) => {
    const key = input.key.toLowerCase();
    const modifier = input.control || input.meta;
    if (
      key === "f12" ||
      (modifier && input.shift && ["i", "j", "c"].includes(key)) ||
      (active &&
        (key === "f5" ||
          key === "f11" ||
          key === "escape" ||
          (modifier &&
            [
              "r",
              "w",
              "q",
              "t",
              "n",
              "l",
              "p",
              "s",
              "c",
              "v",
              "x",
              "a",
            ].includes(key)) ||
          (input.alt && ["left", "right", "f4"].includes(key))))
    ) {
      event.preventDefault();
      report("BLOCKED_SHORTCUT");
    }
  });
  win.webContents.on("context-menu", (event) => event.preventDefault());
  win.webContents.on("will-navigate", (event) => {
    if (active) {
      event.preventDefault();
      report("BLOCKED_NAVIGATION");
    }
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.on("blur", () => report("WINDOW_BLUR"));
  win.on("minimize", () => report("WINDOW_MINIMIZED"));
  win.on("leave-full-screen", () => report("FULLSCREEN_LEFT"));
  const displays = () => report("DISPLAY_CHANGED");
  screen.on("display-added", displays);
  screen.on("display-removed", displays);
  win.on("closed", () => {
    screen.removeListener("display-added", displays);
    screen.removeListener("display-removed", displays);
  });
  return {
    get active() {
      return active;
    },
    async begin() {
      if (screen.getAllDisplays().length !== 1)
        throw new Error(
          "Chỉ sử dụng một màn hình trong khi thi. Ngắt màn hình phụ để tiếp tục.",
        );
      // Consent is presented next to the exam start button. Avoid an additional
      // modal here so getDisplayMedia retains the user's transient activation.
      active = true;
      win.setKiosk(true);
      win.setMinimizable(false);
      win.show();
      win.focus();
    },
    end() {
      active = false;
      win.setKiosk(false);
      win.setMinimizable(true);
    },
  };
}
module.exports = { installExamLock };
