"""Offline PhoWhisper helper. The installer includes runtime and model weights."""

import json
import math
import os
import sys
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "services" / "api"))
try:
    from app.audio_processing import prepare_audio
except ModuleNotFoundError:
    from audio_processing import prepare_audio


def model_path():
    default = (
        Path(sys.executable).parent.parent / "model"
        if getattr(sys, "frozen", False)
        else Path(__file__).parent / "resources" / "stt" / "model"
    )
    path = Path(os.getenv("ORAL_STT_MODEL", str(default)))
    if not (path / "model.bin").is_file():
        raise FileNotFoundError(
            "Missing bundled PhoWhisper model. Reinstall the full desktop package."
        )
    return path


def main():
    path = model_path()
    model = WhisperModel(
        str(path), device="cpu", compute_type="int8", local_files_only=True
    )
    if sys.argv[1:] == ["--check"]:
        print(json.dumps({"ready": True, "model": "PhoWhisper-small", "offline": True}))
        return
    with tempfile.TemporaryDirectory(prefix="oral-desktop-stt-") as folder:
        clean = Path(folder) / "speech.wav"
        # RNNoise is applied by the renderer. Avoid filtering the same audio twice.
        metadata = prepare_audio(Path(sys.argv[1]), clean, "off")
        segments, _ = model.transcribe(
            str(clean),
            language=os.getenv("STT_LANGUAGE", "vi"),
            task="transcribe",
            vad_filter=True,
            beam_size=5,
            condition_on_previous_text=False,
        )
        segments = list(segments)
    text = " ".join(s.text.strip() for s in segments).strip()
    if not text:
        raise ValueError("No speech detected")
    confidence = sum(math.exp(min(0, s.avg_logprob)) for s in segments) / len(segments)
    print(
        json.dumps(
            {
                "transcript": text,
                "stt_confidence": round(confidence, 4),
                "provider": "local",
                "model": "PhoWhisper-small",
                **metadata,
            },
            # Electron reads a pipe, which defaults to an ANSI code page on
            # Windows. JSON escapes preserve Vietnamese without depending on
            # that encoding; JSON.parse restores the original Unicode text.
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
