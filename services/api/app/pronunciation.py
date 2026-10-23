import hashlib
import logging
import tempfile
from contextlib import closing
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from . import speech, storage
from .models import Upload
from .runtime_settings import settings

log = logging.getLogger("oral.pronunciation")


class Scores(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    accuracy: float = Field(ge=0, le=10)
    completeness: float = Field(ge=0, le=10)
    fluency: float = Field(ge=0, le=10)
    prosody: float = Field(ge=0, le=10)
    total: float = Field(ge=0, le=10)


class PronunciationResult(BaseModel):
    status: Literal["COMPLETED"]
    model: Literal["gopt-librispeech"]
    model_revision: str = Field(min_length=1, max_length=100)
    scores: Scores
    segments: int = Field(ge=1, le=200)
    phones: int = Field(ge=1, le=10000)
    reference_source: Literal["transcript"]


def assess(db, exam, attempt, transcript, assessment):
    cfg = settings()
    if not cfg.gopt_enabled or exam.snapshot.get("practice"):
        return assessment
    if speech.exam_policy(db, exam)["language"] != "en":
        return assessment
    try:
        if not transcript or not transcript.strip():
            raise ValueError("Transcript unavailable")
        query = select(Upload).where(
            Upload.attempt_id == attempt.id, Upload.kind == "AUDIO", Upload.status == "COMPLETED",
        )
        if getattr(attempt, "pronunciation_audio_id", None):
            query = query.where(Upload.id == attempt.pronunciation_audio_id)
        audio = db.scalar(query.order_by(Upload.created_at, Upload.id))
        limit = cfg.gopt_max_audio_mb * 1024 * 1024
        if not audio or not audio.storage_key or audio.size > limit:
            raise ValueError("Audio unavailable or too large")
        digest, size = hashlib.sha256(), 0
        with tempfile.TemporaryFile() as target:
            with closing(storage.open_stream(audio.storage_key)) as source:
                while chunk := source.read(1024 * 1024):
                    size += len(chunk)
                    if size > limit:
                        raise ValueError("Audio too large")
                    digest.update(chunk)
                    target.write(chunk)
            if size != audio.size or digest.hexdigest() != audio.sha256:
                raise ValueError("Audio checksum mismatch")
            target.seek(0)
            with httpx.Client(timeout=httpx.Timeout(cfg.gopt_timeout, connect=5), trust_env=False) as client:
                response = client.post(cfg.gopt_url.rstrip("/") + "/assess",
                    data={"transcript": transcript}, files={"audio": ("answer.webm", target, audio.mime_type)})
                response.raise_for_status()
                result = PronunciationResult.model_validate(response.json()).model_dump()
        result["audio_sha256"] = audio.sha256
        result["transcript_sha256"] = hashlib.sha256(transcript.encode()).hexdigest()
    except Exception as exc:
        log.warning("pronunciation_failed attempt=%s type=%s", attempt.id, type(exc).__name__)
        result = {"status": "FAILED", "model": "gopt-librispeech", "error_code": "PRONUNCIATION_FAILED",
                  "message": "Chưa chấm được phát âm. Kiểm tra dịch vụ GOPT, audio và transcript tiếng Anh rồi chấm lại."}
    return assessment | {"pronunciation": result,
                         "review_required": assessment.get("review_required", True) or result["status"] == "FAILED"}
