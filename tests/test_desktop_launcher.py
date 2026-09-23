"""Regression tests for desktop restarts without Docker or Electron dependencies."""

import importlib.util
import socket
import sys
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "run_desktop", Path(__file__).resolve().parents[1] / "scripts/run_desktop.py"
)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class DesktopPortTests(unittest.TestCase):
    def test_free_port(self):
        launcher.check_dev_port(0)

    def test_active_listener_is_rejected(self):
        with socket.socket() as server:
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind(("127.0.0.1", 0))
            server.listen()
            with self.assertRaisesRegex(SystemExit, "đang được dùng"):
                launcher.check_dev_port(server.getsockname()[1])

    @unittest.skipUnless(sys.platform.startswith("linux"), "Linux TIME_WAIT regression")
    def test_recently_closed_server_can_restart(self):
        with socket.socket() as server:
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind(("127.0.0.1", 0))
            port = server.getsockname()[1]
            server.listen()
            with socket.create_connection(("127.0.0.1", port), timeout=2) as client:
                peer, _ = server.accept()
                # Server closes first, leaving its port in TIME_WAIT.
                peer.close()
                self.assertEqual(client.recv(1), b"")
        launcher.check_dev_port(port)


if __name__ == "__main__":
    unittest.main()
