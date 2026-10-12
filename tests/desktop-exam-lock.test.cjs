const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { installExamLock } = require("../apps/desktop/exam-lock.cjs");

test("exam lock blocks navigation/shortcuts and reports incidents only while active", async () => {
  const win = new EventEmitter();
  const screen = new EventEmitter();
  let monitors = 1;
  screen.getAllDisplays = () =>
    Array.from({ length: monitors }, (_, i) => ({ label: `HDMI-${i + 1}` }));
  win.webContents = new EventEmitter();
  const incidents = [];
  win.webContents.send = (_, type) => incidents.push(type);
  win.isDestroyed = () => false;
  win.setKiosk = (value) => {
    win.kiosk = value;
  };
  win.setMinimizable = (value) => {
    win.minimizable = value;
  };
  win.show = win.focus = () => {};
  const lock = installExamLock(win, { screen });
  const input = (key) => {
    let prevented = false;
    win.webContents.emit(
      "before-input-event",
      {
        preventDefault() {
          prevented = true;
        },
      },
      { key, control: true },
    );
    return prevented;
  };
  assert.equal(input("r"), false);
  assert.equal(input("F12"), true);
  monitors = 2;
  await assert.rejects(lock.begin(), /vẫn bật 2 màn hình \(HDMI-1, HDMI-2\)/);
  assert.equal(lock.active, false);
  monitors = 1;
  await lock.begin();
  assert.equal(win.kiosk, true);
  assert.equal(win.minimizable, false);
  for (const key of ["r", "v", "c", "w", "F5", "F11", "Escape"])
    assert.equal(input(key), true);
  assert.equal(input("b"), false);
  let navigationBlocked = false;
  win.webContents.emit("will-navigate", {
    preventDefault() {
      navigationBlocked = true;
    },
  });
  assert.ok(navigationBlocked);
  win.emit("blur");
  screen.emit("display-added");
  assert.ok(incidents.includes("BLOCKED_NAVIGATION"));
  assert.ok(incidents.includes("WINDOW_BLUR"));
  assert.ok(incidents.includes("DISPLAY_CHANGED"));
  // A monitor powered off but still enabled by the OS must remain blocked.
  // Failed resume exits kiosk so the user can disable it in OS settings.
  monitors = 2;
  await assert.rejects(lock.begin(), /Tắt bằng nút nguồn chưa ngắt/);
  assert.equal(lock.active, false);
  assert.equal(win.kiosk, false);
  assert.equal(win.minimizable, true);
  // Re-read the OS state when retrying, without restarting the process.
  monitors = 1;
  await lock.begin();
  assert.equal(lock.active, true);
  assert.equal(win.kiosk, true);
  lock.end();
  assert.equal(win.kiosk, false);
  assert.equal(win.minimizable, true);
  assert.equal(input("r"), false);
  const count = incidents.length;
  win.emit("blur");
  assert.equal(incidents.length, count);
  win.emit("closed");
  assert.equal(screen.listenerCount("display-added"), 0);
});
