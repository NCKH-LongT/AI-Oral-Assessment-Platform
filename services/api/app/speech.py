"""Speech providers and persistent policy; Google credentials stay on the backend."""

import base64
import math
import tempfile
import time
import wave
from functools import lru_cache
from pathlib import Path
from threading import Lock

import httpx
from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from . import google_credentials
from .audio_processing import prepare_audio
from .db import get_db
from .models import Audit, SystemSetting
from .runtime_settings import settings
from .schemas import SpeechPolicy
from .security import admin, current_user, fail

router = APIRouter()
_lock = Lock()


def policy(db):
    row = db.get(SystemSetting, "speech")
    cfg = settings()
    return SpeechPolicy.model_validate(
        row.value if row else {"provider": cfg.stt_provider, "language": cfg.stt_language}
    ).model_dump()


def google_ready():
    return google_credentials.status()["status"] == "ready"


def settings_view(db):
    credentials = google_credentials.status()
    return policy(db) | {
        "google_configured": credentials["status"] == "ready",
        "google_credentials": credentials,
        "server_model": settings().stt_model,
    }


@router.get("/stt/config")
def speech_config(db: Session = Depends(get_db), user=Depends(current_user)):
    return policy(db)


@router.get("/admin/settings/speech")
def speech_settings(db: Session = Depends(get_db), user=Depends(admin)):
    return settings_view(db)


@router.put("/admin/settings/speech")
def save_speech_settings(body: SpeechPolicy, db: Session = Depends(get_db), user=Depends(admin)):
    if body.provider == "google" and not google_ready():
        fail(
            422,
            "GOOGLE_NOT_CONFIGURED",
            "Chưa đọc được credentials Google hợp lệ. Upload JSON trong Cấu hình giọng nói",
        )
    db.merge(SystemSetting(key="speech", value=body.model_dump()))
    db.add(Audit(user_id=user.id, event="SPEECH_SETTINGS_UPDATED", details=body.model_dump()))
    db.commit()
    return settings_view(db)


@router.post("/admin/settings/speech/google-credentials")
def upload_google_credentials(file: UploadFile = File(), db: Session = Depends(get_db), user=Depends(admin)):
    if not (file.filename or "").lower().endswith(".json"):
        fail(422, "INVALID_CREDENTIALS_FILE", "Chọn file JSON service account của Google")
    raw = file.file.read(google_credentials.MAX_BYTES + 1)
    if not raw or len(raw) > google_credentials.MAX_BYTES:
        fail(413, "CREDENTIALS_SIZE", "File credentials phải có nội dung và không vượt 64 KB")
    try:
        metadata = google_credentials.save(raw)
    except (ValueError, TypeError, KeyError):
        fail(
            422,
            "INVALID_GOOGLE_CREDENTIALS",
            "JSON service account không hợp lệ: kiểm tra project, email, private key và token URI Google. File đang dùng được giữ nguyên",
        )
    except OSError:
        fail(
            503,
            "CREDENTIALS_STORAGE_FAILED",
            "Không lưu được credentials. Kiểm tra quyền ghi DATA_DIR của API và volume dùng chung với worker",
        )
    db.add(Audit(user_id=user.id, event="GOOGLE_CREDENTIALS_UPLOADED", details=metadata))
    db.commit()
    return settings_view(db)


@lru_cache(maxsize=1)
def model(name):
    from faster_whisper import WhisperModel

    return WhisperModel(name, device="cpu", compute_type="int8")


def whisper(path, language):
    with _lock:
        segments, info = model(settings().stt_model).transcribe(str(path), language=language, vad_filter=True)
        segments = list(segments)
    confidence = sum(math.exp(min(0, s.avg_logprob)) for s in segments) / len(segments) if segments else 0
    return {
        "transcript": " ".join(s.text.strip() for s in segments).strip(),
        "stt_confidence": round(confidence, 4),
        "language": info.language,
        "model": settings().stt_model,
    }


def google_transcribe(path, language):
    from google.auth.transport.requests import Request

    if not google_ready():
        raise ValueError("Google STT credentials missing")
    credentials = google_credentials.load()
    credentials.refresh(Request())
    texts, confidences = [], []
    deadline = time.monotonic() + 240
    # V1 synchronous recognition accepts <=60s. Split PCM at 55s, never silently truncate.
    with wave.open(str(path), "rb") as audio, httpx.Client() as client:
        while pcm := audio.readframes(55 * 16000):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Google STT deadline exceeded")
            response = client.post(
                "https://speech.googleapis.com/v1/speech:recognize",
                headers={"Authorization": f"Bearer {credentials.token}"},
                json={
                    "config": {
                        "encoding": "LINEAR16",
                        "sampleRateHertz": 16000,
                        "languageCode": "vi-VN" if language == "vi" else "en-US",
                        "enableAutomaticPunctuation": True,
                    },
                    "audio": {"content": base64.b64encode(pcm).decode("ascii")},
                },
                timeout=min(90, remaining),
            )
            response.raise_for_status()
            payload = response.json()
            if "error" in payload:
                raise ValueError("Google STT returned an error")
            for result in payload.get("results", []):
                alternatives = result.get("alternatives", [])
                if alternatives:
                    texts.append(alternatives[0].get("transcript", ""))
                    confidences.append(float(alternatives[0].get("confidence", 0)))
    return {
        "transcript": " ".join(texts).strip(),
        "stt_confidence": round(sum(confidences) / len(confidences), 4) if confidences else 0,
        "language": language,
        "model": "google-speech-v1-default",
    }


def transcribe_file(path, speech_policy=None):
    cfg = settings()
    config = speech_policy or SpeechPolicy(provider=cfg.stt_provider, language=cfg.stt_language).model_dump()
    if config["provider"] not in {"google", "local_server"}:
        raise ValueError("Local STT requires the desktop client")
    with tempfile.TemporaryDirectory(prefix="oral-clean-") as folder:
        clean = Path(folder) / "speech.wav"
        metadata = prepare_audio(Path(path), clean, config["preprocessing"])
        result = (google_transcribe if config["provider"] == "google" else whisper)(clean, config["language"])
    if not result["transcript"].strip():
        raise ValueError("Không phát hiện giọng nói")
    if len(result["transcript"]) > 30000 or not 0 <= result["stt_confidence"] <= 1:
        raise ValueError("Invalid STT response")
    return result | metadata | {"provider": config["provider"]}
