const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { installExamLock } = require("../apps/desktop/exam-lock.cjs");

function fixture() {
  const win = new EventEmitter();
  const screen = new EventEmitter();
  const calls = [];
  screen.getAllDisplays = () => [{ label: "Primary" }];
  win.webContents = new EventEmitter();
  win.webContents.send = () => {};
  win.isDestroyed = () => false;
  win.isKiosk = () => !!win.kiosk;
  win.setKiosk = (value) => {
    calls.push(value);
    win.kiosk = value;
  };
  win.setMinimizable = (value) => {
    win.minimizable = value;
  };
  win.isMinimized = () => !!win.minimized;
  win.restore = () => {
    win.minimized = false;
  };
  win.show = win.focus = () => {};
  return { win, calls, lock: installExamLock(win, { screen }) };
}

test("repeated recovery avoids resetting native kiosk and restores a minimized window", async () => {
  const { win, calls, lock } = fixture();
  await lock.begin();
  win.minimized = true;
  await lock.begin();
  assert.equal(win.minimized, false);
  assert.equal(lock.active, true);
  assert.deepEqual(calls, [true]);
  win.kiosk = false;
  await lock.begin();
  assert.deepEqual(calls, [true, true]);
  lock.end();
});

test("partial lock failure rolls back kiosk so recovery remains usable", async () => {
  const { win, lock } = fixture();
  win.focus = () => {
    throw new Error("Window unavailable");
  };
  await assert.rejects(lock.begin(), /Window unavailable/);
  assert.equal(lock.active, false);
  assert.equal(win.kiosk, false);
  assert.equal(win.minimizable, true);
  win.focus = () => {};
  await lock.begin();
  assert.equal(lock.active, true);
  lock.end();
});
