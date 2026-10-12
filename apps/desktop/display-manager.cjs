const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const { existsSync } = require("node:fs");
const path = require("node:path");

function gnomeRequest(request) {
  return new Promise((resolve, reject) => {
    const bundled =
      process.resourcesPath &&
      path.join(process.resourcesPath, "python", "display-gnome.py");
    const child = execFile(
      "/usr/bin/python3",
      [
        bundled && existsSync(bundled)
          ? bundled
          : path.join(__dirname, "display-gnome.py"),
      ],
      { timeout: 20000, maxBuffer: 262144, windowsHide: true },
      (error, stdout) => {
        if (error)
          return reject(
            new Error(
              "Không chạy được điều khiển màn hình Ubuntu/GNOME. Kiểm tra python3-gi hoặc dùng Cài đặt màn hình.",
            ),
          );
        try {
          const result = JSON.parse(stdout);
          if (!result.ok) throw new Error(result.message);
          resolve(result.state);
        } catch (e) {
          reject(e);
        }
      },
    );
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(request));
  });
}

function createDisplayManager({
  directory,
  platform = process.platform,
  request = gnomeRequest,
}) {
  const file = path.join(directory, "exam-display-backup.json");
  let pending = Promise.resolve();
  const serialized = (operation) => {
    const next = pending.then(operation);
    pending = next.catch(() => {});
    return next;
  };
  async function backup() {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async function save(value) {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(file + ".tmp", JSON.stringify(value), { mode: 0o600 });
    await fs.rename(file + ".tmp", file);
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const unsupported =
    "Tự tắt màn hình hiện hỗ trợ Ubuntu/GNOME. Trên hệ điều hành này, hãy chỉ bật một màn hình trong Cài đặt màn hình rồi thử lại.";
  async function status() {
    const saved = await backup();
    if (platform !== "linux")
      return {
        supported: false,
        monitors: [],
        canRestore: !!saved,
        message: unsupported,
      };
    try {
      const state = await request({ action: "status" });
      return {
        supported: true,
        monitors: state.monitors,
        canRestore: !!saved,
        message: "",
      };
    } catch (e) {
      return {
        supported: false,
        monitors: [],
        canRestore: !!saved,
        message: e.message,
      };
    }
  }
  return {
    idle: () => pending,
    status: () => serialized(status),
    single: (keep) =>
      serialized(async () => {
        if (platform !== "linux") throw new Error(unsupported);
        const state = await request({ action: "status" });
        if (
          typeof keep !== "string" ||
          !state.monitors.some((m) => m.id === keep)
        )
          throw new Error(
            "Màn hình đã chọn không còn hoạt động. Kiểm tra lại.",
          );
        if (state.monitors.length === 1) return status();
        const saved = await backup();
        if (saved && !same(state.snapshot, saved.applied))
          throw new Error(
            "Còn cấu hình màn hình cần khôi phục. Khôi phục trước khi thiết lập lại.",
          );
        const row = state.snapshot.config.find((r) =>
          r.outputs.some((o) => o.id === keep),
        );
        const expected = {
          config: [
            {
              ...row,
              x: 0,
              y: 0,
              primary: true,
              outputs: row.outputs.filter((o) => o.id === keep),
            },
          ],
          layout_mode: state.snapshot.layout_mode,
        };
        // Save BEFORE the OS mutation so crashes/timeouts cannot lose the original.
        await save({
          original: saved?.original || state.snapshot,
          applied: expected,
        });
        await request({ action: "single", keep, expected: state.snapshot });
        const verified = await request({ action: "status" });
        if (verified.monitors.length !== 1 || verified.monitors[0].id !== keep)
          throw new Error(
            "Chưa tắt được màn hình phụ. Kiểm tra lại hoặc khôi phục cấu hình.",
          );
        return status();
      }),
    restore: () =>
      serialized(async () => {
        const saved = await backup();
        if (!saved) return { restored: false };
        await request({
          action: "restore",
          snapshot: saved.original,
          expected: saved.applied,
        });
        const verified = await request({ action: "status" });
        if (!same(verified.snapshot, saved.original))
          throw new Error(
            "Chưa khôi phục đủ cấu hình màn hình. Kết nối lại màn hình rồi thử lại.",
          );
        await fs.unlink(file);
        return { restored: true };
      }),
  };
}
module.exports = { createDisplayManager };
