import time

from test_academic import make_round, setup_class
from test_mvp import ok

from app.models import ExamSession, TeachingClass


def test_profile_class_phases_rounds_history_and_scope(env):
    context, current, body, sid = setup_class(env)
    clients, factory = env
    now = time.time()
    for code, start, end in [("PAST", now - 200, now - 100), ("FUTURE", now + 200, now + 300)]:
        row = ok(clients["admin"].post("/admin/classes", json=body | {"code": code, "starts_at": start, "ends_at": end}), 201)
        ok(clients["admin"].post(f"/admin/classes/{row['id']}/students", json={"student_ids": [sid]}))
    first = make_round(env, context, current)
    second = make_round(env, context, current, "Chưa thi", future=True)
    session = ok(clients["student"].post("/exam-sessions", json={"exam_id": first}))
    profile_url = f"/admin/users/{sid}/profile"
    for role in ("admin", "reviewer", "teacher"):
        profile = ok(clients[role].get(profile_url))
        assert {c["phase"] for c in profile["classes"]} == {"COMPLETED", "ONGOING", "UPCOMING"}
        assert "password_hash" not in profile["user"]
        assert profile["user"]["created_at"]
    assert clients["student"].get(profile_url).status_code == 403
    class_url = f"/admin/users/{sid}/classes/{current['id']}"
    detail = ok(clients["teacher"].get(class_url))
    rounds = {r["id"]: r for r in detail["rounds"]}
    assert rounds[first]["sessions"][0]["id"] == session["id"]
    assert rounds[second]["sessions"] == []
    other_id = ok(clients["outsider"].get("/auth/me"))["id"]
    assert clients["teacher"].get(f"/admin/users/{other_id}/profile").status_code == 403
    assert clients["admin"].get(f"/admin/users/{other_id}/classes/{current['id']}").status_code == 404
    # Frozen assignment/session history survives roster removal.
    ok(clients["admin"].delete(f"/admin/classes/{current['id']}/students/{sid}"))
    assert ok(clients["admin"].get(class_url))["class"]["membership"] == "HISTORY"
    with factory() as db:
        db.get(ExamSession, session["id"]).deleted_at = now
        db.get(TeachingClass, current["id"]).teacher_id = None
        db.commit()
    assert ok(clients["admin"].get(class_url))["rounds"][1]["sessions"] == []
    assert clients["teacher"].get(class_url).status_code == 404
    teacher_id = body["teacher_id"]
    assert len(ok(clients["admin"].get(f"/admin/users/{teacher_id}/profile"))["classes"]) == 2
