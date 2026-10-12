"""Temporary GNOME display configuration; JSON protocol on stdin/stdout.

Uses Mutter's ApplyMonitorsConfig (0 = verify, 1 = temporary). Never changes
saved OS preferences, powers off every output, or guesses an output to retain.
"""
import json
import sys


def read_state(call):
    serial, monitors, logical, props = call("GetCurrentState")
    configs, rows = [], []
    for x, y, scale, transform, primary, specs, _ in logical:
        outputs = []
        for spec in specs:
            physical = next(m for m in monitors if m[0] == spec)
            modes = [m for m in physical[1] if m[6].get("is-current")]
            if len(modes) != 1:
                raise ValueError("Không xác định được chế độ màn hình hiện tại.")
            properties = {}
            if "color-mode" in physical[2]:
                properties["color-mode"] = physical[2]["color-mode"]
            if "is-underscanning" in physical[2]:
                properties["underscanning"] = physical[2]["is-underscanning"]
            outputs.append({"id": spec[0], "identity": list(spec), "mode": modes[0][0], "properties": properties})
            rows.append({"id": spec[0], "name": physical[2].get("display-name", spec[0]), "primary": primary})
        configs.append({"x": x, "y": y, "scale": scale, "transform": transform, "primary": primary, "outputs": outputs})
    snapshot = {"config": configs, "layout_mode": props.get("layout-mode") if props.get("supports-changing-layout-mode") else None}
    return {"serial": serial, "snapshot": snapshot, "monitors": rows}, monitors


def single_snapshot(snapshot, connector):
    for row in snapshot["config"]:
        for output in row["outputs"]:
            if output["id"] == connector:
                return {"config": [row | {"x": 0, "y": 0, "primary": True, "outputs": [output]}], "layout_mode": snapshot["layout_mode"]}
    raise ValueError("Màn hình đã chọn không còn hoạt động. Bấm kiểm tra lại.")


def validate_restore(snapshot, monitors):
    if not snapshot["config"]:
        raise ValueError("Cấu hình khôi phục không có màn hình.")
    for row in snapshot["config"]:
        for output in row["outputs"]:
            matches = [m for m in monitors if list(m[0]) == output["identity"]]
            if len(matches) != 1 or output["mode"] not in [m[0] for m in matches[0][1]]:
                raise ValueError("Màn hình cũ đã bị rút hoặc đổi cấu hình. Kết nối lại rồi bấm Khôi phục các màn hình.")


def apply_snapshot(call, variant, serial, snapshot):
    config = []
    for row in snapshot["config"]:
        outputs = []
        for output in row["outputs"]:
            properties = {k: variant("b" if k == "underscanning" else "u", v) for k, v in output["properties"].items()}
            outputs.append((output["id"], output["mode"], properties))
        config.append((row["x"], row["y"], row["scale"], row["transform"], row["primary"], outputs))
    props = {} if snapshot["layout_mode"] is None else {"layout-mode": variant("u", snapshot["layout_mode"])}
    # Validate before applying. The serial prevents overwriting a concurrent
    # display change made by the user or another application.
    for method in (0, 1):
        call("ApplyMonitorsConfig", variant("(uua(iiduba(ssa{sv}))a{sv})", (serial, method, config, props)))


def handle(request, call, variant):
    state, physical = read_state(call)
    action = request["action"]
    if action == "status":
        return state
    if action == "single":
        if state["snapshot"] != request["expected"]:
            raise ValueError("Cấu hình màn hình vừa thay đổi. Bấm kiểm tra lại trước khi tắt màn hình phụ.")
        target = single_snapshot(state["snapshot"], request["keep"])
    elif action == "restore":
        target = request["snapshot"]
        if state["snapshot"] == target:
            return state
        if state["snapshot"] != request["expected"]:
            raise ValueError("Cấu hình đã được thay đổi ngoài ứng dụng. OralAI giữ nguyên; hãy khôi phục trong Cài đặt màn hình.")
        validate_restore(target, physical)
    else:
        raise ValueError("Thao tác màn hình không hợp lệ.")
    apply_snapshot(call, variant, state["serial"], target)
    return read_state(call)[0]


def main():
    try:
        from gi.repository import Gio, GLib
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

        def call(method, args=None):
            return bus.call_sync("org.gnome.Mutter.DisplayConfig", "/org/gnome/Mutter/DisplayConfig",
                                 "org.gnome.Mutter.DisplayConfig", method, args, None,
                                 Gio.DBusCallFlags.NONE, 5000, None).unpack()

        request = json.loads(sys.stdin.buffer.read(262145))
        result = handle(request, call, GLib.Variant)
        print(json.dumps({"ok": True, "state": result}))
    except ValueError as exc:
        print(json.dumps({"ok": False, "message": str(exc)}))
    except Exception:  # noqa: BLE001 -- expose a bounded IPC error, not a system traceback
        print(json.dumps({"ok": False, "message": "Không điều khiển được màn hình. Tính năng tự tắt hiện cần Ubuntu/GNOME và Python3 có python3-gi. Hãy dùng Cài đặt màn hình nếu hệ điều hành không hỗ trợ."}))


if __name__ == "__main__":
    main()
