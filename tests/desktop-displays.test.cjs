const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm, access } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { createDisplayManager } = require("../apps/desktop/display-manager.cjs");

function snapshot() {
  return {
    config: ["HDMI-3", "HDMI-2"].map((id, i) => ({
      x: i * 1920,
      y: 0,
      scale: 1,
      transform: 0,
      primary: !i,
      outputs: [
        {
          id,
          identity: [id, "vendor", "model", String(i)],
          mode: "1920x1080@60",
          properties: {},
        },
      ],
    })),
    layout_mode: 1,
  };
}
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "oral-displays-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let current = snapshot();
  let failAfterApply = false;
  const calls = [];
  const state = () => ({
    snapshot: structuredClone(current),
    monitors: current.config.flatMap((r) =>
      r.outputs.map((o) => ({ id: o.id, name: o.id, primary: r.primary })),
    ),
  });
  const request = async (body) => {
    calls.push(body.action);
    if (body.action === "single") {
      const saved = JSON.parse(
        await readFile(path.join(directory, "exam-display-backup.json")),
      );
      assert.deepEqual(
        saved.original,
        snapshot(),
        "original layout is on disk before mutation",
      );
      assert.deepEqual(body.expected, current);
      const row = current.config.find((r) =>
        r.outputs.some((o) => o.id === body.keep),
      );
      current = {
        config: [
          {
            ...row,
            x: 0,
            y: 0,
            primary: true,
            outputs: row.outputs.filter((o) => o.id === body.keep),
          },
        ],
        layout_mode: 1,
      };
      if (failAfterApply)
        throw new Error("Timed out after OS applied the change");
    }
    if (body.action === "restore") {
      if (JSON.stringify(current) !== JSON.stringify(body.snapshot))
        assert.deepEqual(
          current,
          body.expected,
          "do not overwrite manual OS changes",
        );
      current = structuredClone(body.snapshot);
    }
    return state();
  };
  return {
    directory,
    request,
    calls,
    state,
    fail: () => {
      failAfterApply = true;
    },
    manager: createDisplayManager({ directory, platform: "linux", request }),
  };
}

test("keeps selected monitor, restores exact layout and clears backup", async (t) => {
  const f = await fixture(t);
  const result = await f.manager.single("HDMI-2");
  assert.equal(result.canRestore, true);
  assert.deepEqual(
    result.monitors.map((m) => m.id),
    ["HDMI-2"],
  );
  assert.equal(f.state().snapshot.config[0].x, 0);
  assert.equal(f.state().snapshot.config[0].primary, true);
  await f.manager.single("HDMI-2");
  assert.deepEqual(await f.manager.restore(), { restored: true });
  assert.deepEqual(f.state().snapshot, snapshot());
  await assert.rejects(
    access(path.join(f.directory, "exam-display-backup.json")),
    { code: "ENOENT" },
  );
  assert.deepEqual(await f.manager.restore(), { restored: false });
});

test("timed-out apply preserves recovery across app restart", async (t) => {
  const f = await fixture(t);
  f.fail();
  await assert.rejects(f.manager.single("HDMI-3"), /Timed out/);
  const restarted = createDisplayManager({
    directory: f.directory,
    platform: "linux",
    request: f.request,
  });
  assert.equal((await restarted.status()).canRestore, true);
  await restarted.restore();
  assert.deepEqual(f.state().snapshot, snapshot());
});

test("invalid selections and unsupported OS never change outputs", async (t) => {
  const f = await fixture(t);
  for (const id of ["missing", "HDMI-2; shutdown now", null, {}])
    await assert.rejects(f.manager.single(id), /không còn hoạt động/);
  assert.equal(f.calls.includes("single"), false);
  const other = createDisplayManager({
    directory: f.directory,
    platform: "darwin",
    request: () => {
      throw new Error("must not execute");
    },
  });
  assert.equal((await other.status()).supported, false);
  await assert.rejects(other.single("HDMI-3"), /Ubuntu\/GNOME/);
});

test("concurrent end/quit waits for preparation and restores once", async (t) => {
  const f = await fixture(t);
  await Promise.all([
    f.manager.single("HDMI-3"),
    f.manager.restore(),
    f.manager.restore(),
  ]);
  assert.deepEqual(f.state().snapshot, snapshot());
  assert.equal(f.calls.filter((c) => c === "restore").length, 1);
});
