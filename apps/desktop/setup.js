const progress = document.querySelector("#progress");
const retry = document.querySelector("#retry");
function render(state) {
  const percent = state.total ? Math.floor(state.downloaded / state.total * 100) : 0;
  progress.value = percent;
  document.querySelector("#percent").textContent = `${percent}%`;
  document.querySelector("#amount").textContent = `${(state.downloaded / 1048576).toFixed(1)} / ${(state.total / 1048576).toFixed(1)} MB`;
  document.querySelector("#file").textContent = state.file || "Kiểm tra model";
  document.querySelector("#status").textContent = state.stage === "error"
    ? `Chưa tải xong: ${state.error}. Kiểm tra kết nối và bấm Thử tải lại.`
    : state.stage === "ready" ? "Đã sẵn sàng. Đang mở OralAI…"
    : state.stage === "retrying" ? "Kết nối bị gián đoạn. Ứng dụng đang tự thử lại…"
    : "Đang tải và kiểm tra model. Bạn có thể để cửa sổ này mở.";
  retry.hidden = state.stage !== "error";
}
async function start() {
  retry.hidden = true;
  try { await window.oralSetup.start(); }
  catch (error) { document.querySelector("#status").textContent = error.message; retry.hidden = false; }
}
window.oralSetup.onProgress(render);
window.oralSetup.status().then(render);
retry.addEventListener("click", start);
void start();
