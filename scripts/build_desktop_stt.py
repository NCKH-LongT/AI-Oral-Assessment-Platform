"""Build the required offline STT runtime AND model on the target OS/architecture."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

WHISPER_ID = "Systran/faster-whisper-small"
WHISPER_REVISION = "536b0662742c02347bc0e980a01041f333bce120"
ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / "apps/desktop/resources/stt"


def prepare_whisper():
    from huggingface_hub import snapshot_download

    target = RESOURCES / "whisper-small"
    metadata = {
        "id": WHISPER_ID,
        "revision": WHISPER_REVISION,
        "quantization": "float16",
        "runtime_compute_type": "int8",
        "license": "MIT",
    }
    required = [
        "model.bin",
        "config.json",
        "tokenizer.json",
        "vocabulary.txt",
        "LICENSE.txt",
    ]
    if (
        all((target / name).is_file() for name in required)
        and (target / "oral-model.json").is_file()
        and json.loads((target / "oral-model.json").read_text()) == metadata
    ):
        return
    snapshot_download(
        WHISPER_ID,
        revision=WHISPER_REVISION,
        local_dir=target,
        allow_patterns=[
            "model.bin",
            "config.json",
            "tokenizer.json",
            "vocabulary.txt",
            "README.md",
        ],
        max_workers=1 if sys.platform == "win32" else 4,
    )
    (target / "LICENSE.txt").write_text((RESOURCES / "WHISPER-LICENSE.txt").read_text())
    (target / "oral-model.json").write_text(json.dumps(metadata, indent=2) + "\n")
    # Hub transfer metadata is not needed by an offline installer.
    shutil.rmtree(target / ".cache", ignore_errors=True)


def build():
    prepare_whisper()
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
            str(ROOT / "services/api"),
            "--distpath",
            str(RESOURCES),
            "--workpath",
            str(ROOT / ".data/desktop-stt-build"),
            "--specpath",
            str(ROOT / ".data/desktop-stt-build"),
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
            "--exclude-module",
            "torch",
            "--exclude-module",
            "transformers",
            str(ROOT / "apps/desktop/transcribe.py"),
        ],
        check=True,
    )
    executable = (
        RESOURCES
        / "oral-stt"
        / ("oral-stt.exe" if sys.platform == "win32" else "oral-stt")
    )
    subprocess.run([str(executable), "--capabilities"], check=True)
    env = dict(os.environ, ORAL_STT_VARIANT="whisper-small")
    env.pop("ORAL_STT_MODEL", None)
    subprocess.run([str(executable), "--check"], env=env, check=True)


if __name__ == "__main__":
    build()
