import hashlib

import pytest
from sqlalchemy import func, select

from app.models import Upload
from test_mvp import ok, prepare, start, upload


@pytest.mark.parametrize("kind", ["AUDIO", "VIDEO", "SCREEN"])
def test_upload_retries_and_one_recording_per_answer(env, kind):
    context = prepare(env, 2)
    clients, factory = env
    student = clients["student"]
    session = start(env, context)
    aid = session["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    payload = {
        "attempt_id": aid, "kind": kind,
        "mime_type": "audio/webm" if kind == "AUDIO" else "video/webm",
        "size": 20, "sha256": hashlib.sha256(b"first").hexdigest(),
    }
    first = ok(student.post("/uploads/init", json=payload))
    assert ok(student.post("/uploads/init", json=payload))["id"] == first["id"]
    changed = payload | {"sha256": hashlib.sha256(b"second").hexdigest()}
    response = student.post("/uploads/init", json=changed)
    if kind == "SCREEN":
        assert ok(response)["id"] != first["id"]
    else:
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "EVIDENCE_ALREADY_EXISTS"
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Upload)) == (2 if kind == "SCREEN" else 1)
    # Another student cannot reuse the first student's upload slot.
    assert clients["outsider"].post("/uploads/init", json=payload).status_code == 403


@pytest.mark.parametrize("kind", ["AUDIO", "VIDEO"])
def test_completed_recording_rejects_replacement_but_next_question_is_independent(env, kind):
    context = prepare(env, 2)
    student = env[0]["student"]
    session = start(env, context)
    aid = session["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    row, blob = upload(student, aid, kind)
    payload = {
        "attempt_id": aid, "kind": kind, "mime_type": f"{kind.lower()}/webm",
        "size": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
    }
    assert ok(student.post("/uploads/init", json=payload))["id"] == row["id"]
    payload["sha256"] = "f" * 64
    assert student.post("/uploads/init", json=payload).status_code == 409
    ok(student.post(f"/question-attempts/{aid}/submit", json={
        "transcript": "This is my submitted answer.", "stt_confidence": 0.9,
    }, headers={"Idempotency-Key": "unique-answer-123"}))
    next_aid = ok(student.get(f"/exam-sessions/{session['id']}"))["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{next_aid}/start"))
    assert ok(student.post("/uploads/init", json=payload | {"attempt_id": next_aid}))["id"] != row["id"]


def test_concurrent_initialization_serializes_on_answer(env):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    clients, factory = env
    with factory() as db:
        if db.bind.dialect.name != "postgresql":
            pytest.skip("PostgreSQL row locks required")
    context = prepare(env, 1)
    student = clients["student"]
    session = start(env, context)
    aid = session["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    payload = {"attempt_id": aid, "kind": "VIDEO", "mime_type": "video/webm",
               "size": 20, "sha256": "a" * 64}
    barrier = Barrier(4)

    def initialize(index):
        barrier.wait(timeout=10)
        return student.post("/uploads/init", json=payload)

    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(initialize, range(4)))
    assert len({ok(response)["id"] for response in responses}) == 1
    barrier = Barrier(4)

    def replace(index):
        barrier.wait(timeout=10)
        return student.post("/uploads/init", json=payload | {"sha256": str(index) * 64})

    with ThreadPoolExecutor(max_workers=4) as pool:
        assert all(response.status_code == 409 for response in pool.map(replace, range(4)))
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Upload)) == 1
