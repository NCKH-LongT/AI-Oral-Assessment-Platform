import math
import tempfile
from functools import lru_cache
from pathlib import Path
from threading import Lock

from fastapi import APIRouter, Depends, File, UploadFile

from .config import settings
from .security import fail, student

router = APIRouter()
lock = Lock()


@lru_cache
def model():
    from faster_whisper import WhisperModel

    return WhisperModel(settings().stt_model, device="cpu", compute_type="int8")


def transcribe_file(path):
    with lock:
        segments, info = model().transcribe(str(path), language=settings().stt_language, vad_filter=True)
        segments = list(segments)
    text = " ".join(s.text.strip() for s in segments).strip()
    # Heuristic segment likelihood, not a calibrated probability of correctness.
    confidence = sum(math.exp(min(0, s.avg_logprob)) for s in segments) / len(segments) if segments else 0
    return {"transcript": text, "stt_confidence": round(confidence, 4), "language": info.language}


@router.post("/stt")
def stt(file: UploadFile = File(), user=Depends(student)):
    content = file.file.read(30 * 1024 * 1024 + 1)
    if not content or len(content) > 30 * 1024 * 1024:
        fail(413, "AUDIO_SIZE", "Audio STT phải dưới 30 MB")
    try:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "answer.webm"
            path.write_bytes(content)
            result = transcribe_file(path)
    except ImportError:
        fail(503, "STT_UNAVAILABLE", "Cài API với extra [stt] hoặc dùng STT local trong Electron")
    except Exception:
        fail(503, "STT_FAILED", "Không thể nhận dạng audio. Kiểm tra model Whisper và thử lại.")
    if not result["transcript"]:
        fail(422, "NO_SPEECH", "Không nhận diện được lời nói. Vui lòng ghi âm lại.")
    return result
