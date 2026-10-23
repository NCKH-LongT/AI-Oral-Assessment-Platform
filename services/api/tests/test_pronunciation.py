import hashlib
import io
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import select
from test_server_processing import submitted, success_grade, success_stt

from app import ai, pronunciation, speech, worker
from app.config import settings
from app.models import Attempt, Exam, ProcessingJob

RESULT = {"status": "COMPLETED", "model": "gopt-librispeech", "model_revision": "test-revision",
          "scores": {name: 7.5 for name in ("accuracy", "completeness", "fluency", "prosody", "total")},
          "segments": 2, "phones": 65, "reference_source": "transcript"}


@pytest.fixture
def context(monkeypatch):
    audio = b"original-audio"
    evidence = SimpleNamespace(size=len(audio), sha256=hashlib.sha256(audio).hexdigest(),
                               storage_key="audio", mime_type="audio/webm")
    db = SimpleNamespace(scalar=lambda query: evidence)
    exam = SimpleNamespace(snapshot={})
    attempt = SimpleNamespace(id="attempt")
    monkeypatch.setattr(pronunciation, "settings", lambda: settings().model_copy(update={"gopt_enabled": True}))
    monkeypatch.setattr(speech, "exam_policy", lambda *args: {"language": "en"})
    monkeypatch.setattr(pronunciation.storage, "open_stream", lambda key: io.BytesIO(audio))
    return db, exam, attempt, evidence


def response(monkeypatch, payload=RESULT, status=200):
    requests = []
    original = httpx.Client

    def handle(request):
        requests.append(request)
        return httpx.Response(status, json=payload)

    monkeypatch.setattr(pronunciation.httpx, "Client",
                        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    return requests


def test_scores_use_original_audio_and_preserve_rubric_score(context, monkeypatch):
    db, exam, attempt, evidence = context
    requests = response(monkeypatch)
    result = pronunciation.assess(db, exam, attempt, "An English answer", success_grade())
    assert result["score"] == 8.5 and result["review_required"] is False
    assert result["pronunciation"]["scores"]["total"] == 7.5
    assert result["pronunciation"]["audio_sha256"] == evidence.sha256
    assert result["pronunciation"]["transcript_sha256"] == hashlib.sha256(b"An English answer").hexdigest()
    assert len(requests) == 1
    assert b"original-audio" in requests[0].content and b"An English answer" in requests[0].content


@pytest.mark.parametrize("language,enabled,practice", [("vi", True, False), ("en", False, False), ("en", True, True)])
def test_skip_non_english_disabled_and_practice(context, monkeypatch, language, enabled, practice):
    db, exam, attempt, _ = context
    exam.snapshot["practice"] = practice
    monkeypatch.setattr(speech, "exam_policy", lambda *args: {"language": language})
    monkeypatch.setattr(pronunciation, "settings", lambda: settings().model_copy(update={"gopt_enabled": enabled}))
    requests = response(monkeypatch)
    original = success_grade()
    assert pronunciation.assess(db, exam, attempt, "Answer", original) == original
    assert not requests


@pytest.mark.parametrize("payload,status", [({"detail": "secret"}, 429), ({"detail": "secret"}, 503),
    (RESULT | {"scores": RESULT["scores"] | {"accuracy": 11}}, 200), ({}, 200)])
def test_provider_failure_retains_content_and_does_not_fabricate_score(context, monkeypatch, payload, status):
    db, exam, attempt, _ = context
    response(monkeypatch, payload, status)
    result = pronunciation.assess(db, exam, attempt, "Answer", success_grade())
    assert result["score"] == 8.5 and result["review_required"]
    assert result["pronunciation"]["status"] == "FAILED"
    assert "scores" not in result["pronunciation"] and "secret" not in str(result)


@pytest.mark.parametrize("problem", ["checksum", "size", "missing", "empty_transcript"])
def test_bad_evidence_never_sent(context, monkeypatch, problem):
    db, exam, attempt, evidence = context
    if problem == "checksum":
        evidence.sha256 = "incorrect"
    elif problem == "size":
        evidence.size = 100 * 1024 * 1024
    elif problem == "missing":
        db.scalar = lambda query: None
    requests = response(monkeypatch)
    result = pronunciation.assess(db, exam, attempt, "" if problem == "empty_transcript" else "Answer", success_grade())
    assert result["pronunciation"]["status"] == "FAILED" and not requests


def test_queue_calls_gopt_after_stt_and_content_and_can_retry_failure(env, monkeypatch):
    _, session, attempts = submitted(env)
    monkeypatch.setattr(pronunciation, "settings", lambda: settings().model_copy(update={"gopt_enabled": True}))
    monkeypatch.setattr(speech, "exam_policy", lambda *args: {"language": "en"})
    order = []

    def stt(*args):
        order.append("stt")
        return success_stt(*args)

    def grade(*args):
        order.append("content")
        return success_grade()

    def client_response(request):
        order.append("gopt")
        return httpx.Response(503 if order.count("gopt") == 1 else 200, json=RESULT)

    original_client = httpx.Client
    monkeypatch.setattr(pronunciation.httpx, "Client",
                        lambda **kwargs: original_client(transport=httpx.MockTransport(client_response), **kwargs))
    monkeypatch.setattr(speech, "transcribe_file", stt)
    monkeypatch.setattr(worker, "check_config", lambda *args: None)
    monkeypatch.setattr(ai, "retrieve", lambda *args: [])
    monkeypatch.setattr(ai, "grade", grade)
    assert worker.tick() and worker.tick()
    with env[1]() as db:
        assert db.scalar(select(ProcessingJob)).status == "FAILED"
        assert db.get(Attempt, attempts[0]).assessment["score"] == 8.5
    assert env[0]["admin"].post(f"/admin/attempts/{attempts[0]}/retry-processing").status_code == 202
    assert worker.tick()
    with env[1]() as db:
        assert db.scalar(select(ProcessingJob)).status == "COMPLETED"
        assert db.get(Attempt, attempts[0]).assessment["pronunciation"]["status"] == "COMPLETED"
    assert order == ["stt", "content", "gopt", "content", "gopt"]


def test_regrading_retains_audio_identity(env, monkeypatch):
    from app.models import ExamSession

    _, session, attempts = submitted(env)
    with env[1]() as db:
        attempt = db.get(Attempt, attempts[0])
        sitting = db.get(ExamSession, session["id"])
        exam = db.get(Exam, sitting.exam_id)
        observed = []
        monkeypatch.setattr(worker, "check_config", lambda *args: None)
        monkeypatch.setattr(ai, "retrieve", lambda *args: [])
        monkeypatch.setattr(ai, "grade", lambda *args: success_grade())
        monkeypatch.setattr(pronunciation, "assess", lambda db, exam, attempt, transcript, result:
                            observed.append((attempt.id, transcript)) or result)
        worker.grade_answer(db, exam, sitting, SimpleNamespace(id=attempt.id, question=attempt.question,
                            finished_at=attempt.finished_at), "Corrected answer", 0.95)
        assert observed == [(attempt.id, "Corrected answer")]
