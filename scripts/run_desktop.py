"""Run desktop/frontend source against an already running server (Linux/macOS)."""

import argparse
import json
import os
import signal
import socket
import subprocess
import time
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--port", type=int, default=3001, help="Local frontend dev port (default: 3001)"
    )
    parser.add_argument(
        "--server",
        default="http://localhost:3000",
        help="Existing web server URL (default: http://localhost:3000)",
    )
    args = parser.parse_args()
    try:
        server = urlsplit(args.server)
        server_port = server.port
    except ValueError:
        parser.error("URL server hoặc port không hợp lệ")
    if (
        server.scheme not in {"http", "https"}
        or not server.hostname
        or server.username
        or server.password
        or server.query
        or server.fragment
        or server.path not in {"", "/"}
    ):
        parser.error(
            "--server cần URL gốc HTTP/HTTPS, không có /api, thông tin đăng nhập hoặc query"
        )
    server_url = args.server.rstrip("/")
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
    if (
        not (ROOT / "node_modules/.bin/electron").exists()
        or not (ROOT / "node_modules/next/dist/bin/next").exists()
    ):
        raise SystemExit(
            "Chưa có dependency desktop. Chạy npm ci một lần rồi mở lại script."
        )
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
    origin = f"http://localhost:{args.port}"
    if (
        server.hostname in {"localhost", "127.0.0.1", "::1"}
        and server_port == args.port
    ):
        raise SystemExit("Cổng dev trùng cổng server. Chọn --port khác.")
    try:
        with urlopen(server_url + "/api/health", timeout=5) as response:
            ready = json.load(response).get("status") == "ok"
    except (URLError, TimeoutError, ValueError):
        ready = False
    if not ready:
        raise SystemExit(
            f"Server {server_url} chưa sẵn sàng. Hãy chạy server trước hoặc chọn --server khác."
        )
    subprocess.run(["node", "apps/admin-web/scripts/copy-audio-assets.mjs"], check=True)
    env = dict(os.environ)
    env.pop("ELECTRON_RUN_AS_NODE", None)
    env["API_INTERNAL_URL"] = server_url + "/api"
    # Explicitly ignore an old ORAL_WEB_URL and use a separate Electron profile.
    env["ORAL_WEB_URL"] = origin
    profile = (
        ROOT
        / ".data"
        / (
            "desktop-dev-profile"
            if args.port == 3001
            else f"desktop-dev-profile-{args.port}"
        )
    )
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
            f"Mở desktop từ SOURCE: {origin} (server: {server_url})\nSửa giao diện sẽ tự cập nhật. Đóng desktop hoặc Ctrl+C để dừng dev server.",
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
        print("\nĐã đóng phiên desktop dev; server hiện có không bị thay đổi.")
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(f"Không chạy được desktop: {error}") from None
