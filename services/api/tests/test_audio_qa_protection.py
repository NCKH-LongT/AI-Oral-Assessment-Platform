import hashlib
import io
from types import SimpleNamespace
import pytest
from app import pronunciation, speech
from app.config import settings


def test_poor_audio_quality_protects_student(monkeypatch):
    """When Audio QA detects poor acoustic quality (mic clipped, extreme noise, silent),
    the system must NOT assign a 0 score; it must set score to None and route to human review.
    """
    gopt_response = {
        "status": "COMPLETED",
        "model": "gopt-librispeech",
        "model_revision": "hubert-base-ls960-qa-v1",
        "audio_quality": {
            "status": "POOR",
            "snr_db": 4.2,
            "clipping_ratio": 0.15,
            "speech_ratio": 0.05,
            "issues": ["AUDIO_CLIPPED", "HIGH_BACKGROUND_NOISE"],
            "recommendation": "Chất lượng âm thanh không đạt chuẩn chấm tự động.",
        },
        "scores": {
            "accuracy": 0.0,
            "completeness": 0.0,
            "fluency": 0.0,
            "prosody": 0.0,
            "total": 0.0,
        },
        "segments": 0,
        "phones": 0,
        "reference_source": "transcript",
        "review_required": True,
        "review_reason": "AUDIO_QUALITY_POOR",
        "message": "Chất lượng âm thanh không đạt chuẩn chấm tự động (quá ồn/bị nghẽn mic). Bài thi được chuyển sang cho Giảng viên thẩm định trực tiếp từ audio gốc.",
    }

    audio = b"dummy-audio-bytes"
    evidence = SimpleNamespace(
        size=len(audio),
        sha256=hashlib.sha256(audio).hexdigest(),
        storage_key="test-key",
        mime_type="audio/webm"
    )
    db = SimpleNamespace(scalar=lambda query: evidence)
    exam = SimpleNamespace(
        snapshot={
            "criteria": [
                {"name": "Content", "description": "Accurate concepts", "max_score": 10, "weight": 1.0},
                {"name": "English Pronunciation", "description": "Accurate phonetic pronunciation", "max_score": 10, "weight": 1.0},
            ],
            "speech_language": "en",
        }
    )
    attempt = SimpleNamespace(id="att-1")

    class MockClient:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, **kwargs):
            class Resp:
                status_code = 200
                def raise_for_status(self): pass
                def json(self): return gopt_response
            return Resp()

    monkeypatch.setattr(pronunciation.httpx, "Client", lambda *a, **kw: MockClient())
    monkeypatch.setattr(pronunciation.storage, "open_stream", lambda key: io.BytesIO(audio))
    monkeypatch.setattr(speech, "exam_policy", lambda *args: {"language": "en"})
    monkeypatch.setattr(pronunciation, "settings", lambda: settings().model_copy(update={"gopt_enabled": True}))

    initial_assessment = {
        "status": "COMPLETED",
        "criteria": [{"name": "Content", "score": 8.0, "max_score": 10, "weight": 1.0}],
    }

    result = pronunciation.assess(db, exam, attempt, "This is an oral test answer.", initial_assessment)

    # Verification: Student is PROTECTED
    assert result["score"] is None
    assert result["status"] == "REVIEW_REQUIRED"
    assert result["review_required"] is True
    assert result["audio_quality_flag"] == "POOR"

    pron_crit = next(c for c in result["criteria"] if c["name"] == "English Pronunciation")
    assert pron_crit["score"] is None
    assert pron_crit["source"] == "manual_review_required"
    assert "Chất lượng âm thanh không đạt chuẩn" in pron_crit["comment"]


def test_passed_audio_quality_calculates_weighted_score(monkeypatch):
    """When Audio QA passes, scores are weighted properly into total assessment."""
    gopt_response = {
        "status": "COMPLETED",
        "model": "gopt-librispeech",
        "model_revision": "hubert-base-ls960-qa-v1",
        "audio_quality": {
            "status": "PASSED",
            "snr_db": 22.5,
            "clipping_ratio": 0.0,
            "speech_ratio": 0.85,
            "issues": [],
            "recommendation": "Âm thanh rõ ràng.",
        },
        "scores": {
            "accuracy": 8.5,
            "completeness": 9.0,
            "fluency": 8.0,
            "prosody": 8.0,
            "total": 8.35,
        },
        "metrics": {
            "wpm": 132.0,
            "speech_duration_seconds": 15.0,
            "speech_ratio": 0.85,
            "snr_db": 22.5,
            "word_count": 33,
        },
        "segments": 1,
        "phones": 250,
        "reference_source": "transcript",
        "review_required": False,
    }

    audio = b"dummy-audio-bytes"
    evidence = SimpleNamespace(
        size=len(audio),
        sha256=hashlib.sha256(audio).hexdigest(),
        storage_key="test-key",
        mime_type="audio/webm"
    )
    db = SimpleNamespace(scalar=lambda query: evidence)
    exam = SimpleNamespace(
        snapshot={
            "criteria": [
                {"name": "Content", "description": "Accurate concepts", "max_score": 10, "weight": 1.0},
                {"name": "Pronunciation", "description": "Accurate phonetic pronunciation", "max_score": 10, "weight": 1.0},
            ],
            "speech_language": "en",
        }
    )
    attempt = SimpleNamespace(id="att-2")

    class MockClient:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, **kwargs):
            class Resp:
                status_code = 200
                def raise_for_status(self): pass
                def json(self): return gopt_response
            return Resp()

    monkeypatch.setattr(pronunciation.httpx, "Client", lambda *a, **kw: MockClient())
    monkeypatch.setattr(pronunciation.storage, "open_stream", lambda key: io.BytesIO(audio))
    monkeypatch.setattr(speech, "exam_policy", lambda *args: {"language": "en"})
    monkeypatch.setattr(pronunciation, "settings", lambda: settings().model_copy(update={"gopt_enabled": True}))

    initial_assessment = {
        "status": "COMPLETED",
        "criteria": [{"name": "Content", "score": 8.0, "max_score": 10, "weight": 1.0}],
    }

    result = pronunciation.assess(db, exam, attempt, "A fluent academic answer.", initial_assessment)

    # Verification: Score calculated correctly
    # Content: 8.0, Pronunciation: 8.35 -> Total: (8.0 + 8.35) / 2 = 8.18
    assert result["score"] == 8.18
    pron_crit = next(c for c in result["criteria"] if c["name"] == "Pronunciation")
    assert pron_crit["score"] == 8.35
    assert pron_crit["source"] == "gopt"
    assert "WPM: 132.0" in pron_crit["comment"]
    assert "SNR: 22.5dB" in pron_crit["comment"]
