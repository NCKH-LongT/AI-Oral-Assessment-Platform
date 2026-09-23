"""Build the required offline STT runtime AND model on the target OS/architecture."""

import json
import subprocess
import sys
from pathlib import Path

MODEL_ID = "vinai/PhoWhisper-small"
MODEL_REVISION = "a86b604c346caf7148c37512eafe783a16420adb"
ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / "apps/desktop/resources/stt"


def prepare_model():
    from ctranslate2.converters import TransformersConverter
    from huggingface_hub import snapshot_download

    target = RESOURCES / "model"
    metadata = {
        "id": MODEL_ID,
        "revision": MODEL_REVISION,
        "quantization": "int8",
        "license": "BSD-3-Clause",
    }
    if (
        (target / "model.bin").exists()
        and (target / "oral-model.json").exists()
        and json.loads((target / "oral-model.json").read_text()) == metadata
    ):
        return
    # Avoid concurrent symlink capability checks on Windows without symlink rights.
    source = snapshot_download(
        MODEL_ID, revision=MODEL_REVISION, max_workers=1 if sys.platform == "win32" else 8
    )
    TransformersConverter(
        source, copy_files=["tokenizer.json", "preprocessor_config.json"]
    ).convert(
        str(target),
        quantization="int8",
        force=True,
    )
    (target / "oral-model.json").write_text(json.dumps(metadata, indent=2) + "\n")
    # Keep attribution with the redistributed model.
    (target / "README.md").write_text(Path(source, "README.md").read_text())
    license_path = ROOT / "apps/desktop/resources/stt/PHOWHISPER-LICENSE.txt"
    (target / "LICENSE.txt").write_text(license_path.read_text())


def build():
    prepare_model()
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
    subprocess.run([str(executable), "--check"], check=True)


if __name__ == "__main__":
    build()
