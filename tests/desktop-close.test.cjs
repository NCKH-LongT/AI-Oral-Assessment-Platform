const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { installUnloadGuard } = require("../apps/desktop/unload-guard.cjs");

test("blocked unload stays open by default and closes only after explicit leave", () => {
  const win = { webContents: new EventEmitter() };
  let response = 0;
  let allowed = 0;
  installUnloadGuard(win, {
    showMessageBoxSync(parent, options) {
      assert.equal(parent, win);
      assert.equal(options.defaultId, 0);
      assert.equal(options.cancelId, 0);
      return response;
    },
  });
  win.webContents.emit("will-prevent-unload", {
    preventDefault() {
      allowed++;
    },
  });
  assert.equal(allowed, 0);
  response = 1;
  win.webContents.emit("will-prevent-unload", {
    preventDefault() {
      allowed++;
    },
  });
  assert.equal(allowed, 1);
});
