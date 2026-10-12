import time
from types import SimpleNamespace

from sqlalchemy import select
from test_mvp import ok, prepare, upload

from app import google_login, routes_exam, worker
from app.models import Assignment, Attempt, CourseEnrollment, ExamSession, OAuthFlow, User
from app.security import digest


def test_web_roles_and_existing_student_tokens(env):
    clients, factory = env
    student = clients["student"]
    student.headers.pop("X-Oral-Client")
    response = student.post("/auth/login", json={"username": "student", "password": "test-password-123"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "DESKTOP_REQUIRED"
    assert student.get("/auth/me").status_code == 403
    assert student.get("/exams/available").status_code == 403
    assert student.post("/auth/refresh").status_code == 403
    for role in ("admin", "teacher", "reviewer"):
        assert clients[role].get("/auth/me").status_code == 200
    student.headers["X-Oral-Client"] = "desktop"
    assert student.post("/auth/refresh").status_code == 200
    assert student.get("/auth/me").status_code == 200
    with factory() as db:
        db.scalar(select(User).where(User.username == "reviewer")).role = "REVIEWER"
        db.commit()
    assert clients["reviewer"].get("/auth/me").status_code == 403
    assert clients["reviewer"].get("/auth/me", headers={"X-Oral-Client": "desktop"}).status_code == 403


def test_google_student_callback_and_poll_cannot_issue_web_tokens(env, monkeypatch):
    clients, factory = env
    browser = clients["outsider"]
    browser.cookies.clear()
    browser.headers.pop("X-Oral-Client")
    monkeypatch.setattr(google_login, "config", lambda: SimpleNamespace(public_origin="http://localhost:3000"))
    monkeypatch.setattr(google_login, "verify_identity", lambda *args: {"sub": "student-sub", "email": "student@example.test"})
    token = "poll-token-123456789012345678901234567890"
    with factory() as db:
        student = db.scalar(select(User).where(User.username == "student"))
        student.google_sub = "student-sub"
        direct = OAuthFlow(state_hash=digest("direct"), nonce="nonce", verifier="verifier", expires_at=time.time() + 300)
        poll = OAuthFlow(poll_hash=digest(token), nonce="nonce", verifier="verifier", completed=True, user_id=student.id, expires_at=time.time() + 300)
        db.add_all([direct, poll])
        db.commit()
        poll_id = poll.id
    response = browser.get("/auth/google/callback", params={"state": "direct", "code": "test"},
                           headers={"Cookie": "google_oauth_state=direct"}, follow_redirects=False)
    assert response.status_code == 303 and "login_error=desktop_required" in response.headers["location"]
    assert not browser.cookies.get("access_token")
    body = {"flow_id": poll_id, "poll_token": token}
    assert browser.post("/auth/google/poll", json=body).status_code == 403
    assert not browser.cookies.get("access_token")
    assert browser.post("/auth/google/poll", json=body, headers={"X-Oral-Client": "desktop"}).status_code == 200
    # Denied web polling must not consume the desktop flow.
    assert browser.post("/auth/google/poll", json=body, headers={"X-Oral-Client": "desktop"}).status_code == 400


def test_student_detail_course_membership_permissions_and_history(env):
    context = prepare(env, 1)
    clients, factory = env
    admin, student = clients["admin"], clients["student"]
    sid = ok(student.get("/auth/me"))["id"]
    course_id = context["course"]["id"]
    detail = f"/admin/users/{sid}/courses"
    path = f"{detail}/{course_id}"
    courses = ok(admin.get(detail))["courses"]
    assert courses[0]["assigned"] and not courses[0]["enrolled"]
    assert student.get(detail).status_code == 403
    assert ok(clients["teacher"].get(detail))["courses"] == []
    for method in ("put", "delete"):
        assert getattr(clients["teacher"], method)(path).status_code == 403
    ok(clients["reviewer"].put(path))
    ok(admin.put(path))
    with factory() as db:
        assert len(db.scalars(select(CourseEnrollment).where(CourseEnrollment.student_id == sid)).all()) == 1
    session = ok(student.post("/exam-sessions", json={"exam_id": context["exam"]["id"]}))
    assert admin.delete(path).status_code == 409
    with factory() as db:
        assert db.scalar(select(CourseEnrollment.id).where(CourseEnrollment.student_id == sid))
        assert db.scalar(select(Assignment.id).where(Assignment.student_id == sid))
        db.get(ExamSession, session["id"]).status = "COMPLETED"
        db.commit()
    ok(admin.delete(path))
    ok(admin.delete(path))
    assert ok(student.get("/exams/available")) == []
    assert student.post("/exam-sessions", json={"exam_id": context["exam"]["id"]}).status_code == 403
    assert student.get(f"/exam-sessions/{session['id']}").status_code == 200
    assert admin.get(f"/admin/results/{session['id']}").status_code == 200
    with factory() as db:
        assert not db.scalar(select(CourseEnrollment.id).where(CourseEnrollment.student_id == sid))
        assert not db.scalar(select(Assignment.id).where(Assignment.student_id == sid))


def test_required_screen_consent_upload_access_and_incident_review(env, monkeypatch):
    context = prepare(env, 1)
    config = routes_exam.settings().model_copy(update={"exam_screen_required": True})
    monkeypatch.setattr(routes_exam, "settings", lambda: config)
    clients, factory = env
    student, admin = clients["student"], clients["admin"]
    session = ok(student.post("/exam-sessions", json={"exam_id": context["exam"]["id"]}))
    assert session["screen_required"]
    key, aid = session["id"], session["screen_attempt_id"]
    path = f"/exam-sessions/{key}"
    assert student.post(path + "/start").status_code == 409
    assert student.post(path + "/start", json={"screen_consent": False}).status_code == 409
    assert student.post(path + "/proctoring-events", json={"type": "WINDOW_BLUR"}).status_code == 409
    ok(student.post(path + "/start", json={"screen_consent": True}))
    with factory() as db:
        assert db.get(ExamSession, key).screen_consent_at is not None
        attempt = db.get(Attempt, aid)
        # Isolate the screen gate and review decision from AI/provider behavior.
        attempt.status = "GRADED"
        attempt.assessment = {"score": 8, "review_required": False}
        db.commit()
    missing = student.post(path + "/finish")
    assert missing.status_code == 409
    assert missing.json()["error"]["code"] == "SCREEN_EVIDENCE_PENDING"
    assert clients["outsider"].post(path + "/proctoring-events", json={"type": "WINDOW_BLUR"}).status_code == 403
    assert student.post(path + "/proctoring-events", json={"type": "INVENTED_EVENT"}).status_code == 422
    ok(student.post(path + "/proctoring-events", json={"type": "WINDOW_BLUR"}), 201)
    evidence, blob = upload(student, aid, "SCREEN", corrupt=True)
    assert admin.get(f"/evidence/{evidence['id']}/content").content == blob
    assert clients["outsider"].get(f"/evidence/{evidence['id']}/content").status_code == 403
    assert clients["teacher"].get(f"/evidence/{evidence['id']}/content").status_code == 403
    final = ok(student.post(path + "/finish"))
    assert final["status"] == "SUBMITTED" and "final_score" not in final
    review = ok(admin.get(f"/admin/results/{key}"))
    assert review["score_summary"]["total_score"] == 8
    assert review["proctoring_events"][0]["details"]["type"] == "WINDOW_BLUR"
    assert review["attempts"][0]["evidence"][0]["kind"] == "SCREEN"
    assert student.post(path + "/proctoring-events", json={"type": "SCREEN_STOPPED"}).status_code == 409
    with factory() as db:
        row = db.get(ExamSession, key)
        row.manual_review = {"score": 7, "reason": "Reviewed screen evidence"}
        worker.finalize(db, row)
        assert row.status == "COMPLETED" and row.final_score == 7


def test_screen_can_upload_before_first_answer_and_policy_is_frozen(env, monkeypatch):
    context = prepare(env, 1)
    config = routes_exam.settings().model_copy(update={"exam_screen_required": True})
    monkeypatch.setattr(routes_exam, "settings", lambda: config)
    student = env[0]["student"]
    session = ok(student.post("/exam-sessions", json={"exam_id": context["exam"]["id"]}))
    config.exam_screen_required = False
    path = f"/exam-sessions/{session['id']}"
    assert ok(student.get(path))["screen_required"]
    ok(student.post(path + "/start", json={"screen_consent": True}))
    upload(student, session["screen_attempt_id"], "SCREEN")
