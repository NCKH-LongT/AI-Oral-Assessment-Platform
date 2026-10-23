const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { defaults, fetchPolicy } = require("../apps/desktop/desktop-policy.cjs");
const { installExamLock } = require("../apps/desktop/exam-lock.cjs");

test("main process fetches authenticated session policy and rejects malformed or unavailable responses", async () => {
  const session = {
    fetch: async (url, options) => {
      assert.equal(
        url,
        "https://oral.test/api/exam-sessions/session-1/desktop-policy",
      );
      assert.equal(options.credentials, "include");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers["X-Oral-Client"], "desktop");
      return { ok: true, json: async () => ({ version: 1, rules: defaults }) };
    },
  };
  assert.deepEqual(
    await fetchPolicy(session, "https://oral.test", "session-1"),
    defaults,
  );
  for (const data of [
    { version: 2, rules: defaults },
    { version: 1, rules: { kiosk: false } },
    { version: 1, rules: { ...defaults, kiosk: "false" } },
  ]) {
    await assert.rejects(
      fetchPolicy(
        { fetch: async () => ({ ok: true, json: async () => data }) },
        "https://oral.test",
        "s",
      ),
      /không tương thích/,
    );
  }
  await assert.rejects(
    fetchPolicy(
      { fetch: async () => ({ ok: false }) },
      "https://oral.test",
      "s",
    ),
    /Không tải/,
  );
});

test("disabled restrictions allow multiple displays and shortcuts; startup updates cannot change an active lock", async () => {
  const win = new EventEmitter();
  const screen = new EventEmitter();
  screen.getAllDisplays = () => [{}, {}];
  win.webContents = new EventEmitter();
  const events = [];
  win.webContents.send = (_, event) => events.push(event);
  let toolsOpened = 0;
  win.webContents.toggleDevTools = () => toolsOpened++;
  win.isDestroyed = () => false;
  win.setKiosk = (value) => {
    win.kiosk = value;
  };
  win.isKiosk = () => !!win.kiosk;
  win.setMinimizable = (value) => {
    win.minimizable = value;
  };
  win.show = win.focus = () => {};
  const lock = installExamLock(win, { screen });
  const disabled = Object.fromEntries(
    Object.keys(defaults).map((key) => [key, false]),
  );
  await lock.begin(disabled);
  assert.equal(win.kiosk || false, false);
  assert.equal(win.minimizable, true);
  lock.configure(defaults);
  assert.deepEqual(lock.rules, disabled);
  for (const key of ["r", "v", "c", "F5", "Escape"]) {
    let blocked = false;
    win.webContents.emit(
      "before-input-event",
      {
        preventDefault: () => {
          blocked = true;
        },
      },
      { key, control: true },
    );
    assert.equal(blocked, false);
  }
  win.webContents.emit(
    "before-input-event",
    { preventDefault() {} },
    { key: "F12" },
  );
  win.webContents.emit(
    "before-input-event",
    { preventDefault() {} },
    { key: "F12", type: "keyUp" },
  );
  win.webContents.emit(
    "before-input-event",
    { preventDefault() {} },
    { key: "F12", type: "keyDown", isAutoRepeat: true },
  );
  assert.equal(toolsOpened, 1);
  for (const name of ["will-navigate", "context-menu"]) {
    win.webContents.emit(name, {
      preventDefault: () => {
        throw new Error("Disabled restriction blocked action");
      },
    });
  }
  win.emit("blur");
  assert.ok(events.includes("WINDOW_BLUR"));
  lock.end();
  assert.deepEqual(lock.rules, defaults);
  await assert.rejects(lock.begin(), /vẫn bật 2/);
});

test("clipboard and shortcut rules operate independently", async () => {
  const win = new EventEmitter();
  const screen = new EventEmitter();
  screen.getAllDisplays = () => [{}];
  win.webContents = new EventEmitter();
  win.webContents.send = () => {};
  win.isDestroyed = () => false;
  win.setKiosk = win.setMinimizable = win.show = win.focus = () => {};
  const lock = installExamLock(win, { screen });
  for (const [clipboard, shortcuts] of [
    [true, false],
    [false, true],
  ]) {
    await lock.begin({
      ...defaults,
      block_clipboard: clipboard,
      block_shortcuts: shortcuts,
    });
    for (const [key, expected] of [
      ["v", clipboard],
      ["r", shortcuts],
    ]) {
      let blocked = false;
      win.webContents.emit(
        "before-input-event",
        {
          preventDefault: () => {
            blocked = true;
          },
        },
        { key, control: true },
      );
      assert.equal(blocked, expected);
    }
  }
});
