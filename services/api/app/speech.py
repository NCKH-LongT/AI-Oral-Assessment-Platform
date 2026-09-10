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
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .audio_processing import prepare_audio
from .config import settings
from .db import get_db
from .models import Audit, SystemSetting
from .schemas import SpeechPolicy
from .security import admin, current_user, fail

router = APIRouter()
_lock = Lock()


def policy(db):
    row = db.get(SystemSetting, "speech")
    return SpeechPolicy.model_validate(
        row.value if row else {"language": settings().stt_language}
    ).model_dump()


def google_ready():
    filename = settings().google_stt_credentials_file
    return bool(filename and Path(filename).is_file())


@router.get("/stt/config")
def speech_config(db: Session = Depends(get_db), user=Depends(current_user)):
    return policy(db)


@router.get("/admin/settings/speech")
def speech_settings(db: Session = Depends(get_db), user=Depends(admin)):
    return policy(db) | {"google_configured": google_ready(), "server_model": settings().stt_model}


@router.put("/admin/settings/speech")
def save_speech_settings(body: SpeechPolicy, db: Session = Depends(get_db), user=Depends(admin)):
    if body.provider == "google" and not google_ready():
        fail(422, "GOOGLE_NOT_CONFIGURED", "Cần cấu hình GOOGLE_STT_CREDENTIALS_FILE trên API và worker")
    db.merge(SystemSetting(key="speech", value=body.model_dump()))
    db.add(Audit(user_id=user.id, event="SPEECH_SETTINGS_UPDATED", details=body.model_dump()))
    db.commit()
    return body.model_dump() | {"google_configured": google_ready(), "server_model": settings().stt_model}


@lru_cache
def model():
    from faster_whisper import WhisperModel

    return WhisperModel(settings().stt_model, device="cpu", compute_type="int8")


def whisper(path, language):
    with _lock:
        segments, info = model().transcribe(str(path), language=language, vad_filter=True)
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
    from google.oauth2 import service_account

    if not google_ready():
        raise ValueError("Google STT credentials missing")
    credentials = service_account.Credentials.from_service_account_file(
        settings().google_stt_credentials_file,
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )
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
    config = speech_policy or SpeechPolicy(language=settings().stt_language).model_dump()
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
