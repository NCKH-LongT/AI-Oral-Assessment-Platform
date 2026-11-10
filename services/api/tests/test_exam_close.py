import copy
import time

from sqlalchemy import select
from test_examination import approve_and_schedule, import_roster, setup_workflow
from test_mvp import ok, upload

from app.models import Assignment, Audit, Exam, ExamSession


def test_close_blocks_entry_but_preserves_running_sessions_and_recovery(env):
    clients, factory, key, _ = setup_workflow(env)
    office, student, waiting = clients["reviewer"], clients["student"], clients["outsider"]
    ok(import_roster(office, key))
    other_id = ok(waiting.get("/auth/me"))["id"]
    with factory() as db:
        db.add(
            Assignment(
                exam_id=key, student_id=other_id, opens_at=time.time() - 5, closes_at=time.time() + 3600
            )
        )
        db.commit()
    approve_and_schedule(clients, key)
    running = ok(student.post("/exam-sessions", json={"exam_id": key}))
    running = ok(student.post(f"/exam-sessions/{running['id']}/start"))
    preflight = ok(waiting.post("/exam-sessions", json={"exam_id": key}))
    with factory() as db:
        before = copy.deepcopy(db.get(Exam, key).snapshot)
    for role in ("teacher", "student", "outsider"):
        assert clients[role].post(f"/admin/exams/{key}/close").status_code == 403
    assert ok(office.post(f"/admin/exams/{key}/close"))["status"] == "CLOSED"
    ok(office.post(f"/admin/exams/{key}/close"))  # Lost acknowledgement is safe to replay.
    row = next(e for e in ok(student.get("/exams/available")) if e["id"] == key)
    assert row["entry_open"] is False and row["can_start_new"] is False
    assert ok(student.post("/exam-sessions", json={"exam_id": key}))["id"] == running["id"]
    assert ok(student.post(f"/exam-sessions/{running['id']}/start"))["started_at"] == running["started_at"]
    assert waiting.post(f"/exam-sessions/{preflight['id']}/start").json()["error"]["code"] == "EXAM_CLOSED"
    assert waiting.post("/exam-sessions", json={"exam_id": key, "new_attempt": True}).status_code == 409
    aid = running["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    upload(student, aid, "AUDIO")
    ok(
        student.post(
            f"/question-attempts/{aid}/submit",
            json={"transcript": "My recorded answer", "stt_confidence": 0.8},
            headers={"Idempotency-Key": "closed-but-running"},
        )
    )
    ok(student.post(f"/exam-sessions/{running['id']}/finish"))
    for role in ("teacher", "student"):
        assert clients[role].post(f"/admin/exams/{key}/reopen").status_code == 403
    ok(office.post(f"/admin/exams/{key}/reopen"))
    ok(office.post(f"/admin/exams/{key}/reopen"))
    ok(waiting.post(f"/exam-sessions/{preflight['id']}/start"))
    with factory() as db:
        assert db.get(Exam, key).snapshot == before
        events = db.scalars(select(Audit).where(Audit.event.in_(["EXAM_CLOSED", "EXAM_REOPENED"]))).all()
        assert [event.event for event in events].count("EXAM_CLOSED") == 1
        assert [event.event for event in events].count("EXAM_REOPENED") == 1


def test_close_draft_is_rejected_and_expired_schedule_is_not_overridden(env):
    clients, factory, key, _ = setup_workflow(env)
    office, student = clients["reviewer"], clients["student"]
    assert office.post(f"/admin/exams/{key}/close").status_code == 409
    assert office.post(f"/admin/exams/{key}/reopen").status_code == 409
    ok(import_roster(office, key))
    approve_and_schedule(clients, key)
    sitting = ok(student.post("/exam-sessions", json={"exam_id": key}))
    ok(office.post(f"/admin/exams/{key}/close"))
    with factory() as db:
        db.scalar(select(Assignment).where(Assignment.exam_id == key)).closes_at = time.time() - 1
        db.commit()
    ok(office.post(f"/admin/exams/{key}/reopen"))
    assert student.post(f"/exam-sessions/{sitting['id']}/start").status_code == 409
    sid = ok(student.get("/auth/me"))["id"]
    ok(
        office.put(
            f"/admin/exams/{key}/schedule",
            json={"student_ids": [sid], "opens_at": time.time() - 1, "closes_at": time.time() + 3600},
        )
    )
    ok(student.post(f"/exam-sessions/{sitting['id']}/start"))
    with factory() as db:
        assert db.get(ExamSession, sitting["id"]).started_at is not None


def test_legacy_exam_close_cannot_be_bypassed_with_publish(env):
    from test_mvp import prepare

    context = prepare(env, 1)
    admin, student = env[0]["admin"], env[0]["student"]
    key = context["exam"]["id"]
    with env[1]() as db:
        frozen = copy.deepcopy(db.get(Exam, key).snapshot)
    ok(admin.post(f"/admin/exams/{key}/close"))
    assert admin.post(f"/admin/exams/{key}/publish").status_code == 409
    assert student.post("/exam-sessions", json={"exam_id": key}).status_code == 409
    ok(admin.post(f"/admin/exams/{key}/reopen"))
    ok(student.post("/exam-sessions", json={"exam_id": key}))
    with env[1]() as db:
        assert db.get(Exam, key).snapshot == frozen
