// Electron otherwise silently keeps a window open when beforeunload blocks it.
function installUnloadGuard(win, dialog) {
  win.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      title: "Rời bài thi?",
      message: "Bạn còn bản ghi hoặc dữ liệu chưa nộp.",
      detail:
        "Thoát hoặc tải lại sẽ mất phần chưa nộp. Chọn ở lại để hoàn tất nộp bài.",
      buttons: ["Ở lại", "Rời trang / thoát"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    // For this Electron event, preventDefault allows the unload to proceed.
    if (choice === 1) event.preventDefault();
  });
}
module.exports = { installUnloadGuard };
