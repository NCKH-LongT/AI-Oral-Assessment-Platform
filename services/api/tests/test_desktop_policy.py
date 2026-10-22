from sqlalchemy import select
from test_mvp import ok, prepare, upload

from app.models import Audit, ExamSession


def test_policy_permissions_validation_snapshot_and_audit(env):
    clients, factory = env
    initial = ok(clients["admin"].get("/admin/settings/desktop"))["rules"]
    for role in ("teacher", "reviewer", "student"):
        assert clients[role].get("/admin/settings/desktop").status_code == 403
        assert clients[role].put("/admin/settings/desktop", json=initial).status_code == 403
    assert clients["admin"].put("/admin/settings/desktop", json=initial | {"kiosk": "false"}).status_code == 422
    assert clients["admin"].put("/admin/settings/desktop", json=initial | {"unknown": False}).status_code == 422
    disabled = dict.fromkeys(initial, False)
    ok(clients["admin"].put("/admin/settings/desktop", json=disabled))
    assert ok(clients["student"].get("/desktop/policy"))["rules"] == disabled
    context = prepare(env, 1)
    sitting = ok(clients["student"].post("/exam-sessions", json={"exam_id": context["exam"]["id"]}))
    assert sitting["desktop_policy"] == disabled
    assert not sitting["screen_required"]
    ok(clients["admin"].put("/admin/settings/desktop", json=dict.fromkeys(initial, True)))
    endpoint = f"/exam-sessions/{sitting['id']}/desktop-policy"
    assert ok(clients["student"].get(endpoint))["rules"] == disabled
    assert clients["outsider"].get(endpoint).status_code == 403
    assert clients["teacher"].get(endpoint).status_code == 403
    with factory() as db:
        assert db.scalar(select(Audit).where(Audit.event == "DESKTOP_POLICY_UPDATED")).details["after"] == disabled
        row = db.get(ExamSession, sitting["id"])
        row.desktop_policy = None
        db.commit()
    legacy = ok(clients["student"].get(endpoint))["rules"]
    assert legacy["require_camera"] and not legacy["require_screen"]


def test_audio_only_submission_and_new_session_requirements(env):
    clients, factory = env
    admin, student = clients["admin"], clients["student"]
    rules = ok(admin.get("/admin/settings/desktop"))["rules"] | {"require_camera": False, "require_screen": False}
    ok(admin.put("/admin/settings/desktop", json=rules))
    context = prepare(env, 1)
    sitting = ok(student.post("/exam-sessions", json={"exam_id": context["exam"]["id"]}))
    key = sitting["id"]
    sitting = ok(student.post(f"/exam-sessions/{key}/start"))
    attempt = sitting["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{attempt}/start"))
    ok(student.post(f"/question-attempts/{attempt}/submit", json={"transcript": "Dependency injection passes dependencies externally.", "stt_confidence": .95}, headers={"Idempotency-Key": "policy-audio-only"}))
    assert student.post(f"/exam-sessions/{key}/finish").status_code == 409
    upload(student, attempt, "AUDIO")
    # Turning camera back on cannot invalidate the sitting already in progress.
    ok(admin.put("/admin/settings/desktop", json=rules | {"require_camera": True, "require_screen": True}))
    ok(student.post(f"/exam-sessions/{key}/finish"))
    assert student.get(f"/exam-sessions/{key}/desktop-policy").status_code == 409
    with factory() as db:
        db.get(ExamSession, key).deleted_at = 1
        db.commit()
    fresh = ok(student.post("/exam-sessions", json={"exam_id": context["exam"]["id"]}))
    assert fresh["desktop_policy"]["require_camera"] and fresh["screen_required"]


def test_camera_preview_needs_audio_and_session_screen_not_question_video(env):
    clients, _ = env
    admin, student = clients["admin"], clients["student"]
    rules = ok(admin.get("/admin/settings/desktop"))["rules"] | {"require_camera": True, "require_screen": True}
    ok(admin.put("/admin/settings/desktop", json=rules))
    context = prepare(env, 1)
    sitting = ok(student.post("/exam-sessions", json={"exam_id": context["exam"]["id"]}))
    key = sitting["id"]
    sitting = ok(student.post(f"/exam-sessions/{key}/start", json={"screen_consent": True}))
    attempt = sitting["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{attempt}/start"))
    ok(student.post(f"/question-attempts/{attempt}/submit", json={"transcript": "Dependency injection passes dependencies externally.", "stt_confidence": .95}, headers={"Idempotency-Key": "screen-plus-audio"}))
    upload(student, attempt, "AUDIO")
    response = student.post(f"/exam-sessions/{key}/finish")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "SCREEN_EVIDENCE_PENDING"
    upload(student, attempt, "SCREEN")
    ok(student.post(f"/exam-sessions/{key}/finish"))
