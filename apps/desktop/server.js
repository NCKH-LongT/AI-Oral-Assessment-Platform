const input = document.querySelector("#server-url");
const status = document.querySelector("#status");
window.serverSettings
  .read()
  .then((value) => {
    input.value = value;
  })
  .catch(() => {
    status.textContent = "Không đọc được cấu hình.";
  });
async function run(action) {
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  status.textContent = "Đang kiểm tra kết nối…";
  try {
    const result = await action(input.value);
    status.textContent = result.message;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}
document
  .querySelector("#test")
  .addEventListener("click", () => run(window.serverSettings.test));
document.querySelector("#server-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void run(window.serverSettings.save);
});
