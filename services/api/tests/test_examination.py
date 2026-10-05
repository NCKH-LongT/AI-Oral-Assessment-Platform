import io
import time
from types import SimpleNamespace

import pytest
from openpyxl import load_workbook
from sqlalchemy import select
from test_mvp import ok, prepare

from app import speech, worker
from app.excel import HEADERS, workbook_bytes
from app.models import Assignment, Attempt, CourseEnrollment, Exam, ExamSession, User


def setup_workflow(env):
    context = prepare(env, 1)
    clients, factory = env
    admin, officer, teacher = clients["admin"], clients["reviewer"], clients["teacher"]
    uid = ok(officer.get("/auth/me"))["id"]
    ok(admin.put(f"/admin/users/{uid}/role", json={"role": "EXAM_OFFICER"}))
    tid = ok(teacher.get("/auth/me"))["id"]
    exam = ok(officer.post("/admin/examination/exams", json={
        "course_id": context["course"]["id"], "teacher_id": tid, "name": "Final examination", "time_limit": 900,
    }), 201)
    key = exam["id"]
    with factory() as db:
        rubric_id = db.get(Exam, key).rubric_id
        db.scalar(select(User).where(User.username == "student")).email = "student@example.edu.vn"
        db.commit()
    payload = context["payload"] | {"rubric_id": rubric_id, "name": "Final examination"}
    ok(teacher.put(f"/admin/exams/{key}", json=payload))
    return clients, factory, key, context


def import_roster(client, key, rows=None):
    raw = workbook_bytes(HEADERS, rows or [["0001", "student@example.edu.vn", "Student", ""]])
    return client.post(f"/admin/exams/{key}/import-students", files={"file": ("students.xlsx", raw)})


def approve_and_schedule(clients, key, opens=None):
    teacher, office = clients["teacher"], clients["reviewer"]
    ok(teacher.post(f"/admin/exams/{key}/generate"))
    ok(teacher.post(f"/admin/exams/{key}/teacher-approve"))
    sid = ok(clients["student"].get("/auth/me"))["id"]
    ok(office.put(f"/admin/exams/{key}/schedule", json={
        "student_ids": [sid], "opens_at": opens or time.time() - 1, "closes_at": time.time() + 3600,
    }))
    ok(office.post(f"/admin/exams/{key}/office-approve"))


def test_workflow_permissions_review_and_schedule(env):
    clients, factory, key, context = setup_workflow(env)
    teacher, office, student, outsider = [clients[k] for k in ("teacher", "reviewer", "student", "outsider")]
    assert import_roster(teacher, key).status_code == 403
    assert ok(import_roster(office, key))["added"] == 1
    assert ok(import_roster(office, key))["added"] == 0
    assert teacher.post(f"/admin/exams/{key}/publish").status_code == 409
    assert office.post(f"/admin/exams/{key}/generate").status_code == 403
    assert office.post(f"/admin/exams/{key}/office-approve").status_code == 409
    generated = ok(teacher.post(f"/admin/exams/{key}/generate"))
    draft = generated["snapshot"]
    assert generated["status"] == "GENERATED"
    question = {k: draft["questions"][0][k] for k in ("text", "expected_concepts", "reference_chunk_ids", "english_terms")}
    question["text"] = "Giải thích Dependency Injection và đưa ví dụ minh họa."
    ok(teacher.put(f"/admin/exams/{key}/draft", json={"questions": [question], "criteria": draft["criteria"]}))
    assert student.get(f"/admin/exams/{key}/draft").status_code == 403
    assert student.post("/exam-sessions", json={"exam_id": key}).status_code == 403
    ok(teacher.post(f"/admin/exams/{key}/teacher-approve"))
    assert teacher.put(f"/admin/exams/{key}/draft", json={"questions": [question], "criteria": draft["criteria"]}).status_code == 409
    assert office.post(f"/admin/exams/{key}/office-approve").status_code == 409
    sid = ok(student.get("/auth/me"))["id"]
    future = time.time() + 1000
    schedule = {"student_ids": [sid], "opens_at": future, "closes_at": future + 3600}
    assert teacher.put(f"/admin/exams/{key}/schedule", json=schedule).status_code == 403
    ok(office.put(f"/admin/exams/{key}/schedule", json=schedule))
    ok(office.post(f"/admin/exams/{key}/office-approve"))
    available = ok(student.get("/exams/available"))
    assert next(e for e in available if e["id"] == key)["opens_at"] == future
    assert student.post("/exam-sessions", json={"exam_id": key}).status_code == 409
    with factory() as db:
        a = db.scalar(select(Assignment).where(Assignment.exam_id == key))
        a.opens_at = time.time() - 1
        other_id = db.scalar(select(User.id).where(User.username == "outsider"))
        db.add(CourseEnrollment(course_id=context["course"]["id"], student_id=other_id))
        db.commit()
    assert key not in [e["id"] for e in ok(outsider.get("/exams/available"))]
    assert outsider.post("/exam-sessions", json={"exam_id": key}).status_code == 403
    session = ok(student.post("/exam-sessions", json={"exam_id": key}))
    with factory() as db:
        db.scalar(select(Assignment).where(Assignment.exam_id == key)).closes_at = time.time() - 1
        db.commit()
    assert student.post(f"/exam-sessions/{session['id']}/start").status_code == 409
    assert import_roster(office, key).status_code == 409


def test_excel_atomicity_email_login_and_export(env):
    clients, factory, key, _ = setup_workflow(env)
    office = clients["reviewer"]
    rows = [["0002", "new@example.edu.vn", "New student", "initial-password-123"],
            ["0003", "conflict@example.edu.vn", "Conflict", ""]]
    with factory() as db:
        db.scalar(select(User).where(User.username == "teacher")).email = "conflict@example.edu.vn"
        db.commit()
    assert import_roster(office, key, rows).status_code == 422
    with factory() as db:
        assert db.scalar(select(User).where(User.email == "new@example.edu.vn")) is None
        assert db.scalar(select(Assignment).where(Assignment.exam_id == key)) is None
    assert ok(import_roster(office, key, rows[:1]))["accounts_created"] == 1
    student = clients["student"]
    user = ok(student.post("/auth/login", json={"username": "NEW@example.edu.vn", "password": "initial-password-123"}))["user"]
    assert user["email"] == "new@example.edu.vn"
    assert import_roster(office, key, rows[:1] * 2).status_code == 422
    result = office.get(f"/admin/exams/{key}/grades.xlsx")
    assert result.status_code == 200
    book = load_workbook(io.BytesIO(result.content))
    assert book.active.cell(2, 1).value == "0002"
    assert book.active.cell(2, 5).value == "NOT_STARTED"
    assert book.active.cell(2, 7).value is None
    assert student.get(f"/admin/exams/{key}/grades.xlsx").status_code == 403


@pytest.mark.parametrize("score,expected", [(0, "REVIEW_REQUIRED"), (4.99, "REVIEW_REQUIRED"), (5, "COMPLETED"), (8, "COMPLETED")])
def test_low_grade_manual_override_and_export(env, score, expected):
    clients, factory, key, _ = setup_workflow(env)
    office, teacher, student = clients["reviewer"], clients["teacher"], clients["student"]
    ok(import_roster(office, key))
    approve_and_schedule(clients, key)
    session = ok(student.post("/exam-sessions", json={"exam_id": key}))
    with factory() as db:
        row = db.get(ExamSession, session["id"])
        row.status = "SUBMITTED"
        attempt = db.scalar(select(Attempt).where(Attempt.session_id == row.id))
        attempt.status, attempt.assessment = "GRADED", {"score": score, "review_required": False}
        db.flush()
        worker.finalize(db, row)
        assert row.ai_score == score and row.status == expected
        assert row.final_score == (score if expected == "COMPLETED" else None)
        db.commit()
    payload = {"score": 6.5, "reason": "Đã kiểm tra bản ghi và nội dung câu trả lời."}
    assert office.post(f"/admin/results/{session['id']}/manual-grade", json=payload).status_code == 403
    ok(teacher.post(f"/admin/results/{session['id']}/manual-grade", json=payload))
    result = ok(student.get(f"/exam-sessions/{session['id']}"))
    assert result["status"] == "COMPLETED" and result["final_score"] == 6.5
    with factory() as db:
        row = db.get(ExamSession, session["id"])
        worker.finalize(db, row)
        assert row.final_score == 6.5 and row.ai_score == score
    book = load_workbook(io.BytesIO(office.get(f"/admin/exams/{key}/grades.xlsx").content))
    assert book.active.cell(2, 6).value == score
    assert book.active.cell(2, 7).value == 6.5


def test_request_role_requires_admin_approval(env):
    clients, _ = env
    student = clients["student"]
    ok(student.post("/auth/request-exam-officer"))
    user = ok(student.get("/auth/me"))
    assert user["role"] == "STUDENT" and user["requested_role"] == "EXAM_OFFICER"
    assert student.get("/admin/examination/teachers").status_code == 403
    ok(clients["admin"].put(f"/admin/users/{user['id']}/role", json={"role": "EXAM_OFFICER"}))
    assert ok(student.get("/auth/me"))["requested_role"] is None
    assert student.get("/admin/examination/teachers").status_code == 200


def test_hotwords_are_frozen_scoped_and_forwarded(env, monkeypatch):
    clients, _, key, context = setup_workflow(env)
    teacher, office, student = clients["teacher"], clients["reviewer"], clients["student"]
    path = f"/admin/courses/{context['course']['id']}/hotwords"
    ok(teacher.put(path, json={"hotwords": ["Dependency Injection", "PostgreSQL"]}))
    ok(import_roster(office, key))
    approve_and_schedule(clients, key)
    ok(teacher.put(path, json={"hotwords": ["Changed vocabulary"]}))
    session = ok(student.post("/exam-sessions", json={"exam_id": key}))
    config = ok(student.get("/stt/config", params={"session_id": session["id"]}))
    assert config["hotwords"] == ["Dependency Injection", "PostgreSQL"]
    assert clients["outsider"].get("/stt/config", params={"session_id": session["id"]}).status_code == 403
    seen = {}
    def recognize(path, policy):
        seen.update(policy)
        return {"transcript": "PostgreSQL", "stt_confidence": .9}
    monkeypatch.setattr("app.stt.transcribe_file", recognize)
    ok(student.post("/stt", data={"session_id": session["id"]}, files={"file": ("a.webm", b"audio")}))
    assert seen["hotwords"] == config["hotwords"]
    def transcribe(*args, **kwargs):
        seen.update(kwargs)
        return [SimpleNamespace(text="PostgreSQL", avg_logprob=-.1)], SimpleNamespace(language="vi")
    monkeypatch.setattr(speech, "model", lambda _: SimpleNamespace(transcribe=transcribe))
    speech.whisper("audio.wav", "vi", config["hotwords"])
    assert seen["hotwords"] == "Dependency Injection, PostgreSQL"


def test_imported_student_google_login_preserves_roster(env, monkeypatch):
    from app import google_login
    from app.models import OAuthFlow
    from app.security import digest

    clients, factory, key, _ = setup_workflow(env)
    office, browser = clients["reviewer"], clients["outsider"]
    ok(import_roster(office, key, [["0009", "google@example.edu.vn", "Google student", ""]]))
    state = "verified-google-import-flow"
    with factory() as db:
        learner = db.scalar(select(User).where(User.email == "google@example.edu.vn"))
        learner_id = learner.id
        db.add(OAuthFlow(state_hash=digest(state), nonce="nonce", verifier="verifier", expires_at=time.time() + 300))
        db.commit()
    monkeypatch.setattr(google_login, "config", lambda: SimpleNamespace(public_origin="http://localhost:3000"))
    monkeypatch.setattr(google_login, "verify_identity", lambda *args: {
        "sub": "google-import-sub", "email": "Google@example.edu.vn", "email_verified": True,
    })
    response = browser.get("/auth/google/callback", params={"state": state, "code": "test"},
                           headers={"Cookie": f"google_oauth_state={state}"}, follow_redirects=False)
    assert response.status_code == 303
    assert ok(browser.get("/auth/me"))["id"] == learner_id
    with factory() as db:
        assert db.get(User, learner_id).google_sub == "google-import-sub"
        assert len(db.scalars(select(User).where(User.email == "google@example.edu.vn")).all()) == 1
        assert db.scalar(select(Assignment).where(Assignment.exam_id == key)).student_id == learner_id


def test_excel_rejects_formulas_and_exports_literal_names(env):
    from openpyxl import Workbook

    clients, _, key, _ = setup_workflow(env)
    office = clients["reviewer"]
    book = Workbook()
    book.active.append(HEADERS)
    book.active.append(["0002", "test@example.edu.vn", '=HYPERLINK("https://example.com")', ""])
    raw = io.BytesIO()
    book.save(raw)
    response = office.post(f"/admin/exams/{key}/import-students", files={"file": ("bad.xlsx", raw.getvalue())})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "EXCEL_FORMULA"
    ok(import_roster(office, key, [["0002", "test@example.edu.vn", "=Literal name", ""]]))
    exported = load_workbook(io.BytesIO(office.get(f"/admin/exams/{key}/grades.xlsx").content))
    assert exported.active.cell(2, 3).value == "=Literal name"
    assert exported.active.cell(2, 3).data_type == "s"
