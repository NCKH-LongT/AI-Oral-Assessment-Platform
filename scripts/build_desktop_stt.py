"""Build optional native Whisper helper on the target OS/architecture (requires PyInstaller)."""

import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
subprocess.run(
    [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--name",
        "oral-stt",
        "--paths",
        str(root / "services/api"),
        "--distpath",
        str(root / "apps/desktop/resources/stt"),
        "--workpath",
        str(root / ".data/desktop-stt-build"),
        "--specpath",
        str(root / ".data/desktop-stt-build"),
        "--collect-all",
        "faster_whisper",
        "--collect-all",
        "ctranslate2",
        "--collect-all",
        "tokenizers",
        "--collect-all",
        "av",
        "--collect-all",
        "imageio_ffmpeg",
        str(root / "apps/desktop/transcribe.py"),
    ],
    check=True,
)
