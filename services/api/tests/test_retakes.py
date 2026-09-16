import time
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

import pytest
from sqlalchemy import func, select
from test_mvp import ok, prepare, upload

from app import storage, worker
from app.models import Attempt, Audit, Exam, ExamSession, MediaCleanup, ReviewJob, Upload


def open_session(student, exam_id, new=False):
    return student.post("/exam-sessions", json={"exam_id": exam_id, "new_attempt": new})


def finish_empty(student, factory, session):
    ok(student.post(f"/exam-sessions/{session['id']}/start"))
    with factory() as db:
        db.get(ExamSession, session["id"]).started_at = time.time() - 20000
        db.commit()
    return ok(student.post(f"/exam-sessions/{session['id']}/finish"))


def test_finite_limits_history_and_reusing_active_session(env):
    context = prepare(env, count=1)
    clients, factory = env
    admin, student = clients["admin"], clients["student"]
    eid = context["exam"]["id"]
    with factory() as db:
        snapshot = deepcopy(db.get(Exam, eid).snapshot)
    ok(admin.put(f"/admin/exams/{eid}/attempt-policy", json={"max_attempts": 2}))
    first = ok(open_session(student, eid))
    assert first["attempt_number"] == 1
    assert ok(open_session(student, eid, True))["id"] == first["id"]
    finish_empty(student, factory, first)
    assert ok(open_session(student, eid))["id"] == first["id"]
    second = ok(open_session(student, eid, True))
    assert second["id"] != first["id"] and second["attempt_number"] == 2
    assert ok(open_session(student, eid, True))["id"] == second["id"]
    finish_empty(student, factory, second)
    assert open_session(student, eid, True).json()["error"]["code"] == "ATTEMPT_LIMIT"
    available = ok(student.get("/exams/available"))[0]
    assert available["attempt_count"] == 2 and available["remaining_attempts"] == 0
    assert not available["can_start_new"]
    assert [s["attempt_number"] for s in available["history"]] == [2, 1]
    result = ok(admin.get(f"/admin/results/{first['id']}"))
    assert [s["attempt_number"] for s in result["history"]] == [2, 1]
    assert len(ok(admin.get("/admin/results"))) == 2
    with factory() as db:
        assert db.get(Exam, eid).snapshot == snapshot
    assert clients["outsider"].get(f"/exam-sessions/{first['id']}").status_code == 403


def test_unlimited_policy_and_grants_are_per_student(env):
    context = prepare(env, count=1)
    clients, factory = env
    admin, student, other = clients["admin"], clients["student"], clients["outsider"]
    eid = context["exam"]["id"]
    other_id = ok(other.get("/auth/me"))["id"]
    ok(admin.post(f"/admin/exams/{eid}/assign", json={"student_ids": [other_id]}))
    first = ok(open_session(student, eid))
    finish_empty(student, factory, first)
    assert open_session(student, eid, True).status_code == 409
    grant = ok(admin.post(f"/admin/results/{first['id']}/retake", json={"additional_attempts": 2}))
    assert grant["remaining_attempts"] == 2
    assert ok(other.get("/exams/available"))[0]["remaining_attempts"] == 1
    for number in (2, 3):
        row = ok(open_session(student, eid, True))
        assert row["attempt_number"] == number
        finish_empty(student, factory, row)
    assert open_session(student, eid, True).status_code == 409
    ok(admin.put(f"/admin/exams/{eid}/attempt-policy", json={"max_attempts": None}))
    for number in (4, 5):
        row = ok(open_session(student, eid, True))
        assert row["attempt_number"] == number
        finish_empty(student, factory, row)
    assert ok(student.get("/exams/available"))[0]["remaining_attempts"] is None
    # Lowering the global limit does not destroy past attempts; a grant still permits a new sitting.
    ok(admin.put(f"/admin/exams/{eid}/attempt-policy", json={"max_attempts": 1}))
    grant = ok(admin.post(f"/admin/results/{first['id']}/retake", json={}))
    assert grant["remaining_attempts"] == 1
    assert ok(open_session(student, eid, True))["attempt_number"] == 6
    assert ok(other.get("/exams/available"))[0]["remaining_attempts"] == 1


def test_only_admin_manages_retakes_and_unlimited_draft_is_preserved(env):
    context = prepare(env, count=1)
    clients, factory = env
    admin, student = clients["admin"], clients["student"]
    eid = context["exam"]["id"]
    row = ok(open_session(student, eid))
    for role in ("student", "outsider", "teacher", "reviewer"):
        client = clients[role]
        assert (
            client.put(f"/admin/exams/{eid}/attempt-policy", json={"max_attempts": None}).status_code == 403
        )
        assert client.post(f"/admin/results/{row['id']}/retake", json={}).status_code == 403
        assert client.delete(f"/admin/results/{row['id']}").status_code == 403
    for limit in (0, -1, 1002):
        assert (
            admin.put(f"/admin/exams/{eid}/attempt-policy", json={"max_attempts": limit}).status_code == 422
        )
    assert (
        admin.post(f"/admin/results/{row['id']}/retake", json={"additional_attempts": 0}).status_code == 422
    )
    draft = ok(admin.post("/admin/exams", json=context["payload"] | {"max_attempts": None}), 201)
    with factory() as db:
        assert db.get(Exam, draft["id"]).max_attempts is None
    copy = ok(admin.post(f"/admin/exams/{draft['id']}/copy"), 201)
    assert copy["max_attempts"] is None


def test_delete_one_sitting_revokes_access_and_cleans_media_with_retry(env, monkeypatch):
    context = prepare(env, count=1)
    clients, factory = env
    admin, student = clients["admin"], clients["student"]
    eid = context["exam"]["id"]
    row = ok(open_session(student, eid))
    session = ok(student.post(f"/exam-sessions/{row['id']}/start"))
    aid = session["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    audio, blob = upload(student, aid, "AUDIO")
    video, _ = upload(student, aid, "VIDEO")
    with factory() as db:
        key = db.get(Upload, audio["id"]).storage_key
        admin_id = ok(admin.get("/auth/me"))["id"]
        db.add(ReviewJob(attempt_id=aid, requested_by=admin_id, reason="test", policy={}, original={}))
        db.commit()
    assert storage.get(key) == blob
    ok(admin.delete(f"/admin/results/{row['id']}"))
    ok(admin.delete(f"/admin/results/{row['id']}"))  # idempotent
    assert ok(admin.get("/admin/results")) == []
    assert ok(student.get("/exams/available"))[0]["remaining_attempts"] == 1
    assert admin.get(f"/admin/results/{row['id']}").status_code == 404
    assert student.get(f"/exam-sessions/{row['id']}").status_code == 404
    assert admin.get(f"/evidence/{audio['id']}/content").status_code == 404
    assert student.post(f"/question-attempts/{aid}/start").status_code == 404
    assert student.post(f"/uploads/{video['id']}/complete").status_code == 404
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Attempt)) == 0
        assert db.scalar(select(func.count()).select_from(ReviewJob)) == 0
        assert db.scalar(select(func.count()).select_from(MediaCleanup)) == 2
        assert db.scalar(select(Audit).where(Audit.event == "EXAM_SESSION_DELETED"))
    real_delete = storage.delete
    monkeypatch.setattr(storage, "delete", lambda key: (_ for _ in ()).throw(OSError("storage unavailable")))
    assert worker.tick()
    with factory() as db:
        job = db.scalar(select(MediaCleanup).where(MediaCleanup.retries == 1))
        assert job is not None and job.next_attempt_at > time.time()
        job.next_attempt_at = 0
        db.commit()
    monkeypatch.setattr(storage, "delete", real_delete)
    assert worker.tick() and worker.tick()
    assert not storage.local_path(key).exists()
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(MediaCleanup)) == 0
    next_row = ok(open_session(student, eid, True))
    assert next_row["attempt_number"] == 2
    assert next_row["id"] != row["id"]


def test_delete_returns_busy_when_worker_holds_attempt_lock(env):
    context = prepare(env, count=1)
    clients, factory = env
    with factory() as db:
        if db.bind.dialect.name != "postgresql":
            pytest.skip("PostgreSQL row-lock regression")
    row = ok(open_session(clients["student"], context["exam"]["id"]))
    with factory() as locked:
        locked.scalar(select(Attempt).where(Attempt.session_id == row["id"]).with_for_update())
        response = clients["admin"].delete(f"/admin/results/{row['id']}")
        assert response.status_code == 409 and response.json()["error"]["code"] == "SESSION_BUSY"
    assert clients["admin"].get(f"/admin/results/{row['id']}").status_code == 200
    ok(clients["admin"].delete(f"/admin/results/{row['id']}"))

    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(
            pool.map(lambda _: ok(open_session(clients["student"], context["exam"]["id"], True)), range(4))
        )
    assert len({row["id"] for row in rows}) == 1
    assert rows[0]["attempt_number"] == 2
