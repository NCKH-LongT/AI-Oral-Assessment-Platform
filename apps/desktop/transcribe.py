"""Offline Vietnamese/English STT with bundled PhoWhisper-small or Whisper-small."""

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


MODELS = {
    "phowhisper-small": ("PhoWhisper-small", "model"),
    "whisper-small": ("Whisper-small", "whisper-small"),
}


def selected_model():
    key = os.getenv("ORAL_STT_VARIANT", "phowhisper-small")
    if key not in MODELS:
        raise ValueError("Unsupported desktop STT model")
    return key


def model_path():
    folder = MODELS[selected_model()][1]
    default = (
        Path(sys.executable).parent.parent / folder
        if getattr(sys, "frozen", False)
        else Path(__file__).parent / "resources" / "stt" / folder
    )
    path = Path(os.getenv("ORAL_STT_MODEL", str(default)))
    if not (path / "model.bin").is_file():
        raise FileNotFoundError(
            "Missing selected STT model. Reinstall the full desktop package."
        )
    return path


def main():
    if sys.argv[1:] == ["--capabilities"]:
        print(json.dumps({"protocol": 2, "models": list(MODELS), "languages": ["vi", "en"], "hotwords": True}))
        return
    label = MODELS[selected_model()][0]
    language = os.getenv("STT_LANGUAGE", "vi")
    if language not in {"vi", "en"}:
        raise ValueError("Unsupported desktop STT language")
    path = model_path()
    model = WhisperModel(
        str(path), device="cpu", compute_type="int8", local_files_only=True
    )
    if sys.argv[1:] == ["--check"]:
        print(json.dumps({"ready": True, "model": label, "language": language, "offline": True}))
        return
    with tempfile.TemporaryDirectory(prefix="oral-desktop-stt-") as folder:
        clean = Path(folder) / "speech.wav"
        # Desktop uses the original recording; only convert format for STT.
        metadata = prepare_audio(Path(sys.argv[1]), clean, "off")
        segments, _ = model.transcribe(
            str(clean),
            language=language,
            task="transcribe",
            vad_filter=True,
            beam_size=5,
            condition_on_previous_text=False,
            hotwords=", ".join(json.loads(os.getenv("STT_HOTWORDS", "[]"))) or None,
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
                "model": label,
                "language": language,
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
