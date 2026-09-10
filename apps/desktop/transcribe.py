"""Local-only STT subprocess; no backend credentials are needed."""

import json
import math
import os
import sys
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "services" / "api"))
from app.audio_processing import prepare_audio

model = WhisperModel(os.getenv("STT_MODEL", "base"), device="cpu", compute_type="int8")
with tempfile.TemporaryDirectory(prefix="oral-desktop-clean-") as folder:
    clean = Path(folder) / "speech.wav"
    metadata = prepare_audio(
        Path(sys.argv[1]), clean, os.getenv("STT_PREPROCESSING", "denoise")
    )
    segments, info = model.transcribe(
        str(clean), language=os.getenv("STT_LANGUAGE", "vi"), vad_filter=True
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
            **metadata,
        },
        ensure_ascii=False,
    )
)
