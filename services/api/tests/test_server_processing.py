import time

import pytest
from sqlalchemy import select
from test_mvp import ok, prepare, start, upload

from app import processing, speech, worker
from app.models import Attempt, Exam, ExamSession, ProcessingJob, SystemSetting

BODY = {"transcript": "", "stt_confidence": None, "processing_mode": "server_audio"}
HEADERS = {"Idempotency-Key": "server-audio-answer-123"}


def submitted(env, count=1, finish=True):
    context = prepare(env, count)
    student = env[0]["student"]
    session = start(env, context)
    aids = []
    for _ in range(count):
        aid = session["current_attempt"]["id"]
        aids.append(aid)
        ok(student.post(f"/question-attempts/{aid}/start"))
        ok(student.post(f"/question-attempts/{aid}/submit", json=BODY, headers=HEADERS))
        upload(student, aid, "AUDIO")
        upload(student, aid, "VIDEO")
        session = ok(student.get(f"/exam-sessions/{session['id']}"))
    if finish:
        session = ok(student.post(f"/exam-sessions/{session['id']}/finish"))
    return context, session, aids


def success_stt(path, policy):
    return {"transcript": "My original spoken answer", "stt_confidence": 0.95, "provider": policy["provider"]}


def success_grade(*args):
    return {"score": 8.5, "confidence": 0.95, "review_required": False, "criteria": [], "reasoning_summary": "Correct"}


def test_queue_starts_only_after_finish_and_exposes_each_stage(env, monkeypatch):
    _, session, aids = submitted(env, finish=False)
    clients, factory = env
    student = clients["student"]
    path = f"/exam-sessions/{session['id']}"
    assert session["server_processing"]
    assert session["processing"]["status"] == "WAITING_SUBMISSION"
    assert not worker.tick()  # No STT or legacy grading before finishing the sitting.
    queued = ok(student.post(path + "/finish"))
    assert queued["status"] == "SUBMITTED" and queued["processing"]["status"] == "QUEUED_STT"
    observed = []

    def stt(path, policy):
        with factory() as db:
            observed.append(db.scalar(select(ProcessingJob.status)))
        return success_stt(path, policy)

    def grade(*args):
        with factory() as db:
            observed.append(db.scalar(select(ProcessingJob.status)))
        return success_grade(*args)

    monkeypatch.setattr(speech, "transcribe_file", stt)
    monkeypatch.setattr(worker, "grade_answer", grade)
    assert worker.tick()
    middle = ok(student.get(path))
    assert middle["processing"] == {"status": "QUEUED_GRADING", "total": 1, "transcribed": 1, "completed": 0, "failed": 0}
    assert middle["final_score"] is None
    # Retried submissions must remain idempotent after server transcription changed the answer.
    ok(student.post(f"/question-attempts/{aids[0]}/submit", json=BODY, headers=HEADERS))
    assert student.post(f"/question-attempts/{aids[0]}/submit", json=BODY,
                        headers={"Idempotency-Key": "another-request"}).status_code == 409
    assert worker.tick()
    assert observed == ["STT_RUNNING", "GRADING_RUNNING"]
    final = ok(student.get(path))
    assert final["status"] == "COMPLETED" and final["final_score"] == 8.5
    assert final["processing"]["completed"] == 1
    assert not worker.tick()
    review = ok(clients["admin"].get(f"/admin/results/{session['id']}"))
    assert review["attempts"][0]["transcript"] == "My original spoken answer"
    assert review["attempts"][0]["processing"]["status"] == "COMPLETED"


def test_queue_finish_requires_recordings(env):
    context = prepare(env, 1)
    student = env[0]["student"]
    session = start(env, context)
    aid = session["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    ok(student.post(f"/question-attempts/{aid}/submit", json=BODY, headers=HEADERS))
    assert student.post(f"/exam-sessions/{session['id']}/finish").json()["error"]["code"] == "EVIDENCE_PENDING"
    assert not worker.tick()


@pytest.mark.parametrize("stage", ["STT", "GRADING"])
def test_failed_stage_is_visible_retryable_and_does_not_leak_provider_error(env, monkeypatch, stage):
    _, session, aids = submitted(env)
    clients, factory = env
    monkeypatch.setattr(speech, "transcribe_file", success_stt)
    monkeypatch.setattr(worker, "grade_answer", success_grade)
    calls = []

    def broken(*args):
        calls.append(stage)
        raise ValueError("secret-provider-key-should-never-be-visible")

    if stage == "GRADING":
        assert worker.tick()
        monkeypatch.setattr(worker, "grade_answer", broken)
    else:
        monkeypatch.setattr(speech, "transcribe_file", broken)
    assert worker.tick()
    review = ok(clients["admin"].get(f"/admin/results/{session['id']}"))
    assert review["status"] == "REVIEW_REQUIRED" and review["final_score"] is None
    assert review["processing"]["failed"] == 1
    assert "secret-provider" not in str(review)
    retry = f"/admin/attempts/{aids[0]}/retry-processing"
    assert clients["student"].post(retry).status_code == 403
    assert clients["teacher"].post(retry).status_code == 403
    ok(clients["admin"].post(retry), 202)
    assert clients["admin"].post(retry).status_code == 409
    monkeypatch.setattr(speech, "transcribe_file", success_stt)
    monkeypatch.setattr(worker, "grade_answer", success_grade)
    if stage == "STT":
        assert worker.tick()
    assert worker.tick()
    assert ok(clients["student"].get(f"/exam-sessions/{session['id']}"))["final_score"] == 8.5
    assert calls == [stage]


def test_expired_claim_recovers_and_live_lease_is_not_reprocessed(env, monkeypatch):
    _, session, _ = submitted(env)
    factory = env[1]
    with factory() as db:
        job = db.scalar(select(ProcessingJob))
        job.status, job.token, job.lease_until = "STT_RUNNING", "old-worker", time.time() + 60
        db.commit()
    monkeypatch.setattr(speech, "transcribe_file", success_stt)
    assert not worker.tick()
    with factory() as db:
        db.scalar(select(ProcessingJob)).lease_until = time.time() - 1
        db.commit()
    assert worker.tick()
    assert ok(env[0]["student"].get(f"/exam-sessions/{session['id']}"))["processing"]["status"] == "QUEUED_GRADING"


def test_policy_frozen_per_submission_and_local_maps_to_server(env):
    context = prepare(env, 1)
    student, factory = env[0]["student"], env[1]
    with factory() as db:
        db.merge(SystemSetting(key="speech", value={"provider": "local", "language": "vi", "preprocessing": "off"}))
        exam = db.get(Exam, context["exam"]["id"])
        exam.snapshot = exam.snapshot | {"speech_language": "en"}
        db.commit()
    session = start(env, context)
    aid = session["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    ok(student.post(f"/question-attempts/{aid}/submit", json=BODY, headers=HEADERS))
    with factory() as db:
        job = db.scalar(select(ProcessingJob))
        assert job.policy["provider"] == "local_server" and job.policy["language"] == "en"
        db.get(SystemSetting, "speech").value = {"provider": "gemini", "language": "vi", "preprocessing": "off"}
        db.commit()
    with factory() as db:
        assert db.scalar(select(ProcessingJob)).policy["provider"] == "local_server"


def test_deleting_course_cascades_jobs_and_does_not_run_stt(env, monkeypatch):
    context, _, _ = submitted(env)
    ok(env[0]["admin"].request("DELETE", f"/admin/courses/{context['course']['id']}", json={"confirm_code": "SE101"}))
    with env[1]() as db:
        assert not db.scalar(select(ProcessingJob))
    monkeypatch.setattr(speech, "transcribe_file", lambda *args: pytest.fail("Deleted answer was transcribed"))
    while worker.tick():
        pass


def test_other_answers_continue_after_stt_failure(env, monkeypatch):
    _, session, aids = submitted(env, 2)
    calls = 0
    def stt(path, policy):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ValueError("bad audio")
        return success_stt(path, policy)
    monkeypatch.setattr(speech, "transcribe_file", stt)
    monkeypatch.setattr(worker, "grade_answer", success_grade)
    for _ in range(3):
        assert worker.tick()
    result = ok(env[0]["student"].get(f"/exam-sessions/{session['id']}"))
    assert result["status"] == "REVIEW_REQUIRED" and result["final_score"] is None
    assert result["processing"]["failed"] == 1 and result["processing"]["completed"] == 1


def test_crashed_worker_leaves_claim_and_recovers_after_lease(env, monkeypatch):
    _, _, _ = submitted(env)
    def interrupted(*args):
        raise SystemExit("worker terminated")
    monkeypatch.setattr(speech, "transcribe_file", interrupted)
    with pytest.raises(SystemExit):
        worker.tick()
    with env[1]() as db:
        job = db.scalar(select(ProcessingJob))
        assert job.status == "STT_RUNNING" and job.runs == 1
        assert db.get(Attempt, job.attempt_id).transcript == ""
        job.lease_until = time.time() - 1
        db.commit()
    monkeypatch.setattr(speech, "transcribe_file", success_stt)
    assert worker.tick()
    with env[1]() as db:
        assert db.scalar(select(ProcessingJob)).status == "QUEUED_GRADING"


def test_running_worker_lock_prevents_reclaim_and_course_deletion(env, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    clients, factory = env
    with factory() as db:
        if db.bind.dialect.name != "postgresql":
            pytest.skip("PostgreSQL row locks required")
    context, session, _ = submitted(env)
    entered, release = Event(), Event()
    def slow_stt(path, policy):
        entered.set()
        assert release.wait(15)
        return success_stt(path, policy)
    monkeypatch.setattr(speech, "transcribe_file", slow_stt)
    monkeypatch.setattr(processing, "LEASE_SECONDS", -1)
    with ThreadPoolExecutor(max_workers=1) as pool:
        task = pool.submit(worker.tick)
        try:
            assert entered.wait(10)
            with factory() as db:
                assert db.scalar(select(ProcessingJob.status)) == "STT_RUNNING"
            assert not worker.tick()
            response = clients["admin"].request("DELETE", f"/admin/courses/{context['course']['id']}", json={"confirm_code": "SE101"})
            assert response.status_code == 409 and response.json()["error"]["code"] == "COURSE_BUSY"
        finally:
            release.set()
        assert task.result(timeout=10)
    with factory() as db:
        assert db.scalar(select(ProcessingJob)).runs == 1
