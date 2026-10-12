import time

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from test_mvp import ok, prepare, start, upload

from app import routes_admin, routes_exam, speech, worker
from app.models import Attempt, Audit, ExamSession, ReviewJob, User
from app.schemas import TranscriptIn

MISSING_STT = {"transcript": "", "stt_confidence": None, "stt_skipped_reason": "MODEL_MISSING"}
HEADERS = {"Idempotency-Key": "missing-stt-submission"}


@pytest.mark.parametrize("payload", [
    {"transcript": "", "stt_confidence": 0},
    {"transcript": " ", "stt_confidence": 0.9},
    {"transcript": " \t\n ", "stt_confidence": 0.9},
    {"transcript": "", "stt_confidence": None},
    {"transcript": "answer", "stt_confidence": None},
    {"transcript": "answer"},
    MISSING_STT | {"transcript": "invented answer"},
    MISSING_STT | {"stt_confidence": 0},
    MISSING_STT | {"stt_confidence": 0.9},
    MISSING_STT | {"stt_skipped_reason": "TRANSCRIPTION_FAILED"},
    MISSING_STT | {"stt_skipped_reason": "NO_SPEECH"},
    MISSING_STT | {"stt_skipped_reason": None},
    MISSING_STT | {"assessment": {"score": 10}},
])
def test_only_explicit_missing_model_accepts_empty_transcript(payload):
    with pytest.raises(ValidationError):
        TranscriptIn.model_validate(payload)


def test_normal_submission_contract_is_unchanged():
    normal = TranscriptIn.model_validate({"transcript": "answer", "stt_confidence": 0.9})
    assert normal.stt_skipped_reason is None
    assert normal.transcript == "answer" and normal.stt_confidence == 0.9
    assert TranscriptIn.model_validate(MISSING_STT).stt_confidence is None


def test_missing_model_advances_exam_without_grading_and_requires_all_evidence(env, monkeypatch):
    context = prepare(env, 2)
    clients, factory = env
    student, admin = clients["student"], clients["admin"]
    config = routes_exam.settings().model_copy(update={"exam_screen_required": True})
    monkeypatch.setattr(routes_exam, "settings", lambda: config)
    session = ok(student.post("/exam-sessions", json={"exam_id": context["exam"]["id"]}))
    session_path = f"/exam-sessions/{session['id']}"
    session = ok(student.post(session_path + "/start", json={"screen_consent": True}))

    def unexpected_provider_call(*args, **kwargs):
        pytest.fail("Missing local model must not invoke automatic STT or grading")

    monkeypatch.setattr(worker, "grade_answer", unexpected_provider_call)
    monkeypatch.setattr(speech, "transcribe_file", unexpected_provider_call)
    evidence = []
    for sequence in (1, 2):
        attempt_id = session["current_attempt"]["id"]
        attempt_path = f"/question-attempts/{attempt_id}"
        ok(student.post(attempt_path + "/start"))
        assert ok(student.post(attempt_path + "/submit", json=MISSING_STT, headers=HEADERS))["status"] == "GRADED"
        ok(student.post(attempt_path + "/submit", json=MISSING_STT, headers=HEADERS))
        assert not worker.tick()
        session = ok(student.get(session_path))
        assert session["answered_count"] == sequence
        if sequence == 1:
            assert session["current_attempt"]["sequence"] == 2
            assert student.post(session_path + "/finish").json()["error"]["code"] == "INCOMPLETE"
        else:
            assert session["current_attempt"] is None
            assert student.post(session_path + "/finish").json()["error"]["code"] == "SCREEN_EVIDENCE_PENDING"
            upload(student, session["screen_attempt_id"], "SCREEN")
            assert student.post(session_path + "/finish").json()["error"]["code"] == "EVIDENCE_PENDING"
        evidence.append(upload(student, attempt_id, "AUDIO"))
        if sequence == 2:
            assert student.post(session_path + "/finish").json()["error"]["code"] == "EVIDENCE_PENDING"
        upload(student, attempt_id, "VIDEO")

    final = ok(student.post(session_path + "/finish"))
    assert final["status"] == "SUBMITTED"
    assert not {"final_score", "score_summary", "grading_message"} & final.keys()
    assert ok(student.post(session_path + "/finish"))["status"] == "SUBMITTED"
    reviewed = ok(admin.get(f"/admin/results/{session['id']}"))
    for attempt in reviewed["attempts"]:
        assert attempt["transcript"] == "" and attempt["stt_confidence"] is None
        assert attempt["stt_skipped_reason"] == "MODEL_MISSING"
        assessment = attempt["assessment"]
        assert assessment["status"] == "NOT_GRADED" and assessment["review_required"]
        assert assessment["score"] is None and assessment["confidence"] is None
        assert assessment["stt_status"] == "unavailable"
        assert assessment["stt_skipped_reason"] == "MODEL_MISSING"
        assert assessment["criteria"] == [] and assessment["retrieved_chunks"] == []
    for row, original_bytes in evidence:
        assert admin.get(f"/evidence/{row['id']}/content").content == original_bytes
        assert clients["outsider"].get(f"/evidence/{row['id']}/content").status_code == 403
    with factory() as db:
        audits = db.scalars(select(Audit).where(Audit.event == "STT_SKIPPED")).all()
        assert len(audits) == 2  # Retrying did not create a second submission.
        assert all(a.details["stt_skipped_reason"] == "MODEL_MISSING" for a in audits)
        assert not db.scalar(select(ReviewJob.id))
        stored_session = db.get(ExamSession, session["id"])
        assert stored_session.ai_score is None and stored_session.final_score is None


def test_missing_model_keeps_ownership_state_deadline_and_idempotency_guards(env):
    context = prepare(env, 1)
    clients, factory = env
    student = clients["student"]
    session = start(env, context)
    attempt_id = session["current_attempt"]["id"]
    path = f"/question-attempts/{attempt_id}"
    assert student.post(path + "/submit", json=MISSING_STT, headers=HEADERS).status_code == 409
    ok(student.post(path + "/start"))
    assert clients["outsider"].post(path + "/submit", json=MISSING_STT, headers=HEADERS).status_code == 403
    assert student.post(path + "/submit", json={"transcript": "", "stt_confidence": 0}, headers=HEADERS).status_code == 422
    student.headers.pop("X-Oral-Client")
    assert student.post(path + "/submit", json=MISSING_STT, headers=HEADERS).status_code == 403
    student.headers["X-Oral-Client"] = "desktop"
    with factory() as db:
        assert db.get(Attempt, attempt_id).status == "STARTED"
        db.get(ExamSession, session["id"]).started_at = time.time() - 1000
        db.commit()
    # As with normal submissions, a started recording may arrive after expiry.
    ok(student.post(path + "/submit", json=MISSING_STT, headers=HEADERS))
    assert student.post(path + "/submit", json=MISSING_STT,
                        headers={"Idempotency-Key": "a-different-key"}).status_code == 409
    assert student.post(path + "/submit", json={"transcript": "replacement", "stt_confidence": 1},
                        headers=HEADERS).status_code == 409
    assert student.post(path + "/start").status_code == 409
    assert student.post(f"/exam-sessions/{session['id']}/finish").json()["error"]["code"] == "EVIDENCE_PENDING"


def test_staff_web_and_desktop_cannot_use_student_missing_model_exception(env):
    context = prepare(env, 1)
    clients, factory = env
    session = start(env, context)
    attempt_id = session["current_attempt"]["id"]
    path = f"/question-attempts/{attempt_id}"
    ok(clients["student"].post(path + "/start"))
    with factory() as db:
        # Exercise the skip channel/role check separately from ownership.
        db.get(ExamSession, session["id"]).student_id = db.scalar(select(User.id).where(User.role == "ADMIN"))
        db.commit()
    for client_header in ({}, {"X-Oral-Client": "desktop"}):
        response = clients["admin"].post(path + "/submit", json=MISSING_STT, headers=HEADERS | client_header)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "DESKTOP_STT_SKIP_REQUIRED"


def test_admin_can_explicitly_retranscribe_original_audio_and_preserve_skip_history(env, monkeypatch):
    context = prepare(env, 1)
    clients, factory = env
    student, admin = clients["student"], clients["admin"]
    session = start(env, context)
    attempt_id = session["current_attempt"]["id"]
    path = f"/question-attempts/{attempt_id}"
    ok(student.post(path + "/start"))
    ok(student.post(path + "/submit", json=MISSING_STT, headers=HEADERS))
    audio, original_bytes = upload(student, attempt_id, "AUDIO")
    upload(student, attempt_id, "VIDEO")
    final = ok(student.post(f"/exam-sessions/{session['id']}/finish"))
    assert final["status"] == "SUBMITTED"
    monkeypatch.setattr(routes_admin, "google_ready", lambda: True)
    review_path = f"/admin/attempts/{attempt_id}/google-review"
    for role in ("teacher", "reviewer", "student", "outsider"):
        assert clients[role].post(review_path, json={"reason": "Missing model recovery"}).status_code == 403
    assert admin.post(f"/admin/attempts/{attempt_id}/grade-review", json={
        "reason": "Missing transcript cannot be graded", "target_exam_id": context["exam"]["id"],
    }).json()["error"]["code"] == "NO_TRANSCRIPT"

    def failed_transcription(*args):
        raise RuntimeError("Temporary provider outage")

    monkeypatch.setattr(speech, "transcribe_file", failed_transcription)
    failed_job = ok(admin.post(review_path, json={"reason": "Recognize original audio"}), 202)
    assert worker.tick()
    with factory() as db:
        assert db.get(ReviewJob, failed_job["id"]).status == "FAILED"
        assert db.get(Attempt, attempt_id).assessment["stt_skipped_reason"] == "MODEL_MISSING"
        assert db.get(ExamSession, session["id"]).final_score is None

    def transcribe(source, config):
        assert source.read_bytes() == original_bytes
        assert config["provider"] == "google"
        return {"transcript": "Recovered spoken answer", "stt_confidence": 0.95, "preprocessing": "off"}

    def grade(db, exam, current_session, attempt, transcript, confidence):
        assert transcript == "Recovered spoken answer" and confidence == 0.95
        return {"score": 8, "confidence": 0.9, "review_required": True, "status": "COMPLETED"}

    monkeypatch.setattr(speech, "transcribe_file", transcribe)
    monkeypatch.setattr(worker, "grade_answer", grade)
    job = ok(admin.post(review_path, json={"reason": "Retry original audio recognition"}), 202)
    assert worker.tick()
    reviewed = ok(admin.get(f"/admin/results/{session['id']}"))["attempts"][0]
    assert reviewed["transcript"] == "" and reviewed["stt_confidence"] is None
    assert reviewed["stt_skipped_reason"] == "MODEL_MISSING"
    assert reviewed["assessment"]["score"] == 8
    review = next(item for item in reviewed["reviews"] if item["id"] == job["id"])
    assert review["result"]["transcript"] == "Recovered spoken answer"
    assert review["original"]["stt_skipped_reason"] == "MODEL_MISSING"
    assert review["original"]["audio_id"] == audio["id"]
    assert review["original"]["assessment"]["score"] is None
    # A review must not make the immutable original submission unretryable.
    ok(student.post(path + "/submit", json=MISSING_STT, headers=HEADERS))
    with factory() as db:
        assert db.get(Attempt, attempt_id).assessment["score"] == 8
        assert len(db.scalars(select(Audit).where(Audit.event == "STT_SKIPPED")).all()) == 1
