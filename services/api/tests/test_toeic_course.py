"""Authored course imports retain history, enroll once and expose only the prompt."""
import importlib.util
from pathlib import Path

from sqlalchemy import func, select

from app import ai, speech
from app.models import Assignment, Attempt, Course, CourseEnrollment, Document, Exam, User


def test_toeic_import_enrollment_idempotency_and_public_prompt(env, monkeypatch):
    clients, factory = env
    path = Path(__file__).resolve().parents[3] / "data/toeic-speaking/import_course.py"
    spec = importlib.util.spec_from_file_location("toeic_import", path)
    importer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(importer)
    cfg = ai.settings().model_copy(update={"ai_provider": "gemini"})
    monkeypatch.setattr(ai, "settings", lambda: cfg)
    monkeypatch.setattr(ai, "embed", lambda *args, **kwargs: [0.01] * 768)
    monkeypatch.setattr(importer, "SessionLocal", factory)
    importer.main()
    with factory() as db:
        exam = db.scalar(select(Exam))
        key, course_id = exam.id, exam.course_id
        assert exam.max_attempts is None and exam.status == "PUBLISHED"
        assert not exam.snapshot.get("practice")
        assert len(exam.snapshot["questions"]) == 11
        assert len(exam.snapshot["topic_chunk_ids"]) == 11
        assert db.scalar(select(func.count()).select_from(Document).where(Document.status == "READY")) == 11
        assert speech.exam_policy(db, exam)["language"] == "en"
        assert speech.policy(db)["language"] == "vi"
        assert db.scalar(select(func.count()).select_from(Assignment)) == 2
        assert db.scalar(select(func.count()).select_from(CourseEnrollment)) == 2
        db.add(User(username="new_student", name="New", role="STUDENT", status="ACTIVE", password_hash="unused"))
        db.add(User(username="inactive_student", name="Inactive", role="STUDENT", status="DISABLED", password_hash="unused"))
        db.commit()
    importer.main()
    importer.main()
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Exam)) == 1
        assert db.scalar(select(func.count()).select_from(CourseEnrollment)) == 3
        assert db.scalar(select(func.count()).select_from(Assignment)) == 3
        assert db.get(Course, course_id).hotwords
    student = clients["student"]
    assert key in [e["id"] for e in student.get("/exams/available").json()]
    result = student.post("/exam-sessions", json={"exam_id": key})
    assert result.status_code in {200, 201}, result.text
    session_id = result.json()["id"]
    result = student.post(f"/exam-sessions/{session_id}/start")
    assert result.status_code == 200, result.text
    with factory() as db:
        attempts = db.scalars(select(Attempt).where(Attempt.session_id == session_id).order_by(Attempt.sequence)).all()
        for attempt in attempts[:2]:
            attempt.status = "SUBMITTED"
        db.commit()
    view = student.get(f"/exam-sessions/{session_id}").json()
    prompt = view["current_attempt"]
    assert prompt["prompt_image"] == "/practice/toeic-speaking/office.svg"
    assert "grading_reference" not in prompt and "expected_concepts" not in prompt
    assert student.get(f"/stt/config?session_id={session_id}").json()["language"] == "en"
    assert clients["outsider"].get(f"/stt/config?session_id={session_id}").status_code == 403
    with factory() as db:
        attempt = db.scalar(select(Attempt).where(Attempt.session_id == session_id, Attempt.sequence == 3))
        attempt.question = attempt.question | {"prompt_image": "https://external.example/picture.svg"}
        db.commit()
    assert student.get(f"/exam-sessions/{session_id}").json()["current_attempt"]["prompt_image"] is None
