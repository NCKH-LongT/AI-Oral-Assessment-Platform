"""Run current desktop/frontend source with the local Compose backend (Linux/macOS)."""

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--port", type=int, default=3001, help="Local frontend dev port (default: 3001)"
    )
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Port must be between 1024 and 65535")
    os.chdir(ROOT)
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", args.port))
        except OSError:
            raise SystemExit(
                f"Cổng {args.port} đang được dùng. Đóng phiên dev cũ hoặc chọn --port khác."
            ) from None
    if not (ROOT / ".env").exists():
        subprocess.run([sys.executable, "scripts/setup_env.py"], check=True)
    subprocess.run(["npm", "ci"], check=True)
    subprocess.run(
        [
            "node",
            "-e",
            (
                "require('./apps/desktop/check-stt-bundle.cjs')({electronPlatformName:process.platform})"
                ".catch(e=>{console.error(e.message);process.exit(1)})"
            ),
        ],
        check=True,
    )
    base = ["docker", "compose", "-f", str(ROOT / "docker-compose.yml")]
    # Read only the origin/port settings into the override, never copy deployment secrets.
    rendered = subprocess.run(
        base + ["config", "--format", "json"],
        capture_output=True,
        text=True,
        check=False,
    )
    if rendered.returncode:
        raise SystemExit(
            "Không đọc được Docker Compose. Kiểm tra Docker và .env; log cấu hình không được in để tránh lộ khóa."
        )
    config = json.loads(rendered.stdout)
    web_port = int(config["services"]["web"]["ports"][0]["published"])
    if web_port == args.port:
        raise SystemExit("Cổng dev trùng cổng web Docker. Chọn --port khác.")
    origin = f"http://localhost:{args.port}"
    allowed = (
        config["services"]["api"]["environment"].get("ALLOWED_ORIGINS", "").split(",")
    )
    allowed = list(dict.fromkeys([*(v.strip() for v in allowed if v.strip()), origin]))
    override = {
        "services": {
            name: {"environment": {"ALLOWED_ORIGINS": ",".join(allowed)}}
            for name in ("api", "worker")
        }
    }
    with tempfile.TemporaryDirectory(prefix="oral-desktop-run-") as directory:
        override_path = Path(directory) / "compose.json"
        override_path.write_text(json.dumps(override))
        print("Cập nhật server từ source hiện tại; giữ các volume dữ liệu.", flush=True)
        subprocess.run(
            base + ["-f", str(override_path), "up", "-d", "--build", "--wait"],
            check=True,
        )
    subprocess.run(["node", "apps/admin-web/scripts/copy-audio-assets.mjs"], check=True)
    env = dict(os.environ)
    env.pop("ELECTRON_RUN_AS_NODE", None)
    env["API_INTERNAL_URL"] = f"http://127.0.0.1:{web_port}/api"
    # Explicitly ignore an old ORAL_WEB_URL and use a separate Electron profile.
    env["ORAL_WEB_URL"] = origin
    profile = ROOT / ".data" / "desktop-dev-profile"
    profile.mkdir(parents=True, exist_ok=True)
    processes = []

    def stop(_signal, _frame):
        raise KeyboardInterrupt

    old_term = signal.signal(signal.SIGTERM, stop)
    try:
        next_server = subprocess.Popen(
            [
                "node",
                str(ROOT / "node_modules/next/dist/bin/next"),
                "dev",
                "--webpack",
                "--hostname",
                "127.0.0.1",
                "--port",
                str(args.port),
            ],
            cwd=ROOT / "apps/admin-web",
            env=env,
            start_new_session=True,
        )
        processes.append(next_server)
        deadline = time.monotonic() + 90
        while True:
            if next_server.poll() is not None:
                raise RuntimeError(
                    "Giao diện dev không khởi động được; xem lỗi phía trên."
                )
            try:
                with urlopen(origin + "/api/health", timeout=2) as response:
                    if json.load(response).get("status") == "ok":
                        break
            except (URLError, TimeoutError, ValueError):
                pass
            if time.monotonic() > deadline:
                raise RuntimeError(
                    "Hết thời gian chờ giao diện/API. Kiểm tra log dev phía trên."
                )
            time.sleep(0.5)
        # Playwright E2E can verify this URL; the UI is compiled from the working tree.
        print(
            f"Mở desktop từ SOURCE: {origin}\nSửa giao diện sẽ tự cập nhật. Đóng desktop hoặc Ctrl+C để dừng dev server.",
            flush=True,
        )
        electron = subprocess.Popen(
            [
                str(ROOT / "node_modules/.bin/electron"),
                str(ROOT / "apps/desktop"),
                "--user-data-dir=" + str(profile),
            ],
            env=env,
            start_new_session=True,
        )
        processes.append(electron)
        while electron.poll() is None:
            if next_server.poll() is not None:
                raise RuntimeError(
                    "Dev server đã dừng; đóng desktop để tránh dùng giao diện cũ."
                )
            time.sleep(0.5)
        if electron.returncode:
            raise RuntimeError("Electron không khởi động được; xem log phía trên.")
    finally:
        for process in reversed(processes):
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
        signal.signal(signal.SIGTERM, old_term)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nĐã đóng phiên desktop dev; server Docker vẫn chạy.")
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(f"Không chạy được desktop: {error}") from None
