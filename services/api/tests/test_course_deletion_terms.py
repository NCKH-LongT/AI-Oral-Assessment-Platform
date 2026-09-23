from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from test_mvp import ok, prepare, start, upload

from app import ai, storage, worker
from app.models import (
    Assignment,
    Attempt,
    Audit,
    BookSection,
    Chunk,
    Course,
    CourseEnrollment,
    Document,
    Exam,
    ExamSession,
    LearningOutcome,
    MediaCleanup,
    ReviewJob,
    Rubric,
    Topic,
    TopicDocument,
    TopicOutcome,
    TopicSection,
    Upload,
    User,
)
from app.schemas import QuestionOutput

TERMS = [{"term": "dependency injection", "meaning": "tiêm phụ thuộc"}]


def test_question_generation_requests_validated_english_terms(monkeypatch):
    monkeypatch.setattr(ai, "settings", lambda: SimpleNamespace(ai_provider="local"))

    def structured(instruction, data, schema):
        assert "english_terms" in instruction and "English" in instruction
        assert data["evidence"][0]["id"] == "chunk"
        return schema.model_validate({
            "text": "Giải thích dependency injection.",
            "expected_concepts": ["DI"], "reference_chunk_ids": ["chunk"],
            "english_terms": TERMS + [{"term": "Dependency Injection", "meaning": "trùng"}],
        })

    monkeypatch.setattr(ai, "structured", structured)
    question = ai.generate_question(SimpleNamespace(name="DI"), "EASY", [{"id": "chunk"}], [])
    assert question["english_terms"] == TERMS
    for invalid in ([{"term": "", "meaning": "trống"}], TERMS * 21):
        with pytest.raises(ValidationError):
            QuestionOutput.model_validate(question | {"english_terms": invalid})


def test_generated_terms_are_persisted_visible_to_staff_and_hidden_from_student(env, monkeypatch):
    generate = ai.generate_question
    monkeypatch.setattr(ai, "generate_question", lambda *a, **kw: generate(*a, **kw) | {"english_terms": TERMS})
    context = prepare(env, count=1)
    clients, factory = env
    path = f"/admin/courses/{context['course']['id']}/workspace"
    questions = ok(clients["admin"].get(path))["exams"][0]["questions"]
    assert questions[0]["english_terms"] == TERMS
    session = start(env, context)
    assert "english_terms" not in str(session)
    assert clients["student"].get(path).status_code == 403
    with factory() as db:
        exam = db.get(Exam, context["exam"]["id"])
        assert exam.snapshot["questions"][0]["english_terms"] == TERMS
        assert exam.snapshot["generation_prompt_version"] == "topic-los-english-terms-v3"
        # Published exams from before this feature still load without mutation.
        snapshot = dict(exam.snapshot)
        snapshot["questions"] = [{k: v for k, v in q.items() if k != "english_terms"}
                                 for q in snapshot["questions"]]
        exam.snapshot = snapshot
        db.commit()
    assert ok(clients["admin"].get(path))["exams"][0]["questions"][0]["english_terms"] == []


def test_delete_entire_course_requires_admin_confirmation_and_cleans_all_children(env, monkeypatch):
    context = prepare(env, count=1)
    clients, factory = env
    admin, student = clients["admin"], clients["student"]
    course_id = context["course"]["id"]
    path = f"/admin/courses/{course_id}"
    session = start(env, context)
    attempt_id = session["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{attempt_id}/start"))
    uploaded, _ = upload(student, attempt_id, "AUDIO")
    untouched = ok(admin.post("/admin/courses", json={"code": "KEEP", "name": "Keep me"}), 201)
    with factory() as db:
        admin_id = db.scalar(select(User.id).where(User.role == "ADMIN"))
        student_id = db.scalar(select(User.id).where(User.username == "student"))
        doc = db.get(Document, context["document"]["id"])
        keys = [doc.storage_key, db.get(Upload, uploaded["id"]).storage_key]
        chapter = BookSection(course_id=course_id, document_id=doc.id, title="Chapter",
                              start_page=1, end_page=1)
        db.add(chapter)
        db.flush()
        topic_id = context["topic"]["id"]
        db.add(TopicSection(topic_id=topic_id, section_id=chapter.id))
        if not db.get(TopicDocument, (topic_id, doc.id)):
            db.add(TopicDocument(topic_id=topic_id, document_id=doc.id))
        db.add(CourseEnrollment(course_id=course_id, student_id=student_id))
        db.add(ReviewJob(attempt_id=attempt_id, requested_by=admin_id, reason="Review audio",
                         policy={}, original={}))
        db.commit()
    for role in ("teacher", "reviewer", "student", "outsider"):
        assert clients[role].request("DELETE", path, json={"confirm_code": "SE101"}).status_code == 403
    assert admin.request("DELETE", path, json={"confirm_code": "WRONG"}).status_code == 422
    assert admin.delete(path).status_code == 409
    assert ok(admin.get(path + "/workspace"))["exams"]
    ok(admin.request("DELETE", path, json={"confirm_code": "SE101"}))
    assert admin.get(path + "/workspace").status_code == 404
    assert student.get(f"/exam-sessions/{session['id']}").status_code == 404
    with factory() as db:
        assert db.get(Course, untouched["id"]) is not None
        assert db.scalar(select(func.count()).select_from(User)) == 5
        for model in (Assignment, Attempt, BookSection, Chunk, CourseEnrollment, Document, Exam,
                      ExamSession, LearningOutcome, ReviewJob, Rubric, Topic, TopicDocument,
                      TopicOutcome, TopicSection, Upload):
            assert db.scalar(select(func.count()).select_from(model)) == 0, model
        assert db.scalar(select(Audit).where(Audit.event == "COURSE_DELETED")).details["course_id"] == course_id
        assert set(db.scalars(select(MediaCleanup.storage_key))) == set(keys)
    # Storage downtime must not undo deletion or lose cleanup jobs.
    original_delete = storage.delete
    monkeypatch.setattr(storage, "delete", lambda key: (_ for _ in ()).throw(OSError("offline")))
    assert worker.tick()
    with factory() as db:
        queued = db.scalars(select(MediaCleanup)).all()
        assert len(queued) == 2 and sum(item.retries for item in queued) == 1
        for item in queued:
            item.next_attempt_at = 0
        db.commit()
    monkeypatch.setattr(storage, "delete", original_delete)
    assert worker.tick() and worker.tick()
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(MediaCleanup)) == 0
    for key in keys:
        assert not storage.local_path(key).exists()


@pytest.mark.parametrize("model", [Document, Exam, Attempt, Upload])
def test_course_delete_retries_when_related_rows_are_locked(env, model):
    clients, factory = env
    with factory() as db:
        if db.bind.dialect.name != "postgresql":
            pytest.skip("PostgreSQL row locks required")
    context = prepare(env, count=1)
    session = start(env, context)
    attempt_id = session["current_attempt"]["id"]
    ok(clients["student"].post(f"/question-attempts/{attempt_id}/start"))
    uploaded, _ = upload(clients["student"], attempt_id, "AUDIO")
    key = {Document: context["document"]["id"], Exam: context["exam"]["id"],
           Attempt: attempt_id, Upload: uploaded["id"]}[model]
    path = f"/admin/courses/{context['course']['id']}"
    with factory() as lock:
        lock.scalar(select(model).where(model.id == key).with_for_update())
        response = clients["admin"].request("DELETE", path, json={"confirm_code": "SE101"})
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "COURSE_BUSY"
        with factory() as db:
            assert db.get(Course, context["course"]["id"]) is not None
            assert db.get(Attempt, attempt_id) is not None
            assert db.scalar(select(func.count()).select_from(MediaCleanup)) == 0
    ok(clients["admin"].request("DELETE", path, json={"confirm_code": "SE101"}))
