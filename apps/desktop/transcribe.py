"""Local-only STT subprocess; no backend credentials are needed."""

import json
import math
import os
import sys

from faster_whisper import WhisperModel

model = WhisperModel(os.getenv("STT_MODEL", "base"), device="cpu", compute_type="int8")
segments, info = model.transcribe(
    sys.argv[1], language=os.getenv("STT_LANGUAGE", "vi"), vad_filter=True
)
segments = list(segments)
text = " ".join(s.text.strip() for s in segments).strip()
if not text:
    raise ValueError("No speech detected")
confidence = sum(math.exp(min(0, s.avg_logprob)) for s in segments) / len(segments)
print(
    json.dumps(
        {"transcript": text, "stt_confidence": round(confidence, 4)}, ensure_ascii=False
    )
)
