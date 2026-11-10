import copy
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from test_examination import import_roster, setup_workflow
from test_mvp import ok

from app import ai, worker
from app.grading import GradingError, review_question
from app.models import Attempt, Exam
from app.question_rubrics import criteria_for, draft_criteria, rubric_identity
from app.schemas import RubricIn

CONTENT = [
    {
        "name": "Content",
        "description": "Full: direct answer; partial: incomplete; zero: unrelated",
        "max_score": 3,
        "weight": 2,
    }
]
AUDIO = {"name": "Pronunciation", "description": "Teacher checks original audio", "max_score": 2, "weight": 1}


def test_draft_is_question_grounded_and_preserves_audio_criterion(monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "settings", lambda: SimpleNamespace(ai_provider="local"))

    def structured(prompt, payload, schema):
        calls.append((prompt, payload))
        return RubricIn(name="Draft", criteria=CONTENT)

    monkeypatch.setattr(ai, "structured", structured)
    base = CONTENT + [AUDIO]
    result = draft_criteria(
        {"text": "Describe your daily routine", "criteria": [{"name": "ignored"}]}, base, [{"id": "evidence"}]
    )
    assert result == CONTENT + [AUDIO] and result is not base
    assert calls[0][1]["question"] == {"text": "Describe your daily routine"}
    assert calls[0][1]["template"] == CONTENT and calls[0][1]["evidence"]
    assert "partial and zero credit" in calls[0][0]
    assert draft_criteria({"text": "Speak"}, [AUDIO], []) == [AUDIO]
    assert len(calls) == 1


@pytest.mark.parametrize(
    "bad", [[], CONTENT * 2, [CONTENT[0] | {"max_score": float("nan")}], [CONTENT[0] | {"weight": 0}]]
)
def test_malformed_explicit_criteria_never_fall_back_silently(bad):
    with pytest.raises(ValidationError):
        criteria_for({"criteria": CONTENT}, {"criteria": bad})


def test_legacy_fallback_and_rubric_fingerprint():
    snapshot = {"criteria": CONTENT}
    assert criteria_for(snapshot) == CONTENT
    assert rubric_identity(snapshot)["rubric_scope"] == "exam_legacy"
    assert (
        rubric_identity(snapshot, {"criteria": CONTENT})["rubric_sha256"]
        == rubric_identity(snapshot)["rubric_sha256"]
    )
    assert (
        rubric_identity(snapshot, {"criteria": [CONTENT[0] | {"weight": 3}]})["rubric_sha256"]
        != rubric_identity(snapshot)["rubric_sha256"]
    )


def test_review_compares_effective_question_rubrics_including_legacy(monkeypatch):
    monkeypatch.setattr("app.grading.check_config", lambda target: None)
    q = {"text": "Describe your daily routine", "topic_id": "topic"}
    source = SimpleNamespace(snapshot={"criteria": CONTENT}, time_limit=900, course_id="course")
    target = SimpleNamespace(
        status="CLOSED",
        time_limit=900,
        course_id="course",
        snapshot={"ai_provider": "local", "criteria": [AUDIO], "questions": [q | {"criteria": CONTENT}]},
    )
    attempt = SimpleNamespace(question=q)
    assert review_question(source, target, attempt)["criteria"] == CONTENT
    target.snapshot["questions"][0]["criteria"] = [CONTENT[0] | {"max_score": 2}]
    with pytest.raises(GradingError):
        review_question(source, target, attempt)


def test_ai_preview_is_scoped_and_does_not_replace_saved_question(env, monkeypatch):
    from app import examination

    clients, factory, key, _ = setup_workflow(env)
    teacher = clients["teacher"]
    snapshot = ok(teacher.post(f"/admin/exams/{key}/generate"))["snapshot"]
    original = copy.deepcopy(snapshot)
    body = {
        k: snapshot["questions"][0][k]
        for k in ("text", "expected_concepts", "reference_chunk_ids", "english_terms")
    }
    body["text"] = "Describe your preferred daily routine and explain why."
    seen = []

    def preview(question, template, evidence, outcomes):
        seen.append((question, template, evidence))
        return CONTENT

    monkeypatch.setattr(examination, "draft_criteria", preview)
    path = f"/admin/exams/{key}/questions/1/rubric-preview"
    assert clients["student"].post(path, json=body).status_code == 403
    assert clients["reviewer"].post(path, json=body).status_code == 403
    assert teacher.post(path, json=body | {"reference_chunk_ids": ["foreign"]}).status_code == 422
    result = ok(teacher.post(path, json=body))
    assert result["criteria"] == CONTENT and result["review_required"]
    assert seen[0][0]["text"] == body["text"] and seen[0][2]
    with factory() as db:
        assert db.get(Exam, key).snapshot == original
    ok(teacher.post(f"/admin/exams/{key}/teacher-approve"))
    assert teacher.post(path, json=body).status_code == 409


def test_question_criteria_survive_review_publication_and_drive_grading(env, monkeypatch):
    clients, factory, key, context = setup_workflow(env)
    teacher, office, student = clients["teacher"], clients["reviewer"], clients["student"]
    with factory() as db:
        exam = db.get(Exam, key)
        exam.blueprint = [exam.blueprint[0] | {"count": 2}]
        db.commit()
    snapshot = ok(teacher.post(f"/admin/exams/{key}/generate"))["snapshot"]
    questions = [
        {k: q[k] for k in ("text", "expected_concepts", "reference_chunk_ids", "english_terms", "criteria")}
        for q in snapshot["questions"]
    ]
    questions[0]["criteria"] = copy.deepcopy(CONTENT)
    questions[1]["criteria"] = [CONTENT[0] | {"name": "Personal reasons", "max_score": 5}]
    body = {"questions": questions, "criteria": snapshot["criteria"]}
    ok(teacher.put(f"/admin/exams/{key}/draft", json=body))
    invalid = copy.deepcopy(body)
    invalid["questions"][0]["criteria"] = None
    assert teacher.put(f"/admin/exams/{key}/draft", json=invalid).status_code == 422
    ok(import_roster(office, key))
    # Do not regenerate: teacher review is the source of frozen criteria.
    ok(teacher.post(f"/admin/exams/{key}/teacher-approve"))
    import time

    sid = ok(student.get("/auth/me"))["id"]
    ok(
        office.put(
            f"/admin/exams/{key}/schedule",
            json={"student_ids": [sid], "opens_at": time.time() - 1, "closes_at": time.time() + 3600},
        )
    )
    ok(office.post(f"/admin/exams/{key}/office-approve"))
    assert teacher.put(f"/admin/exams/{key}/draft", json=body).status_code == 409
    session = ok(student.post("/exam-sessions", json={"exam_id": key}))
    from sqlalchemy import select

    observed = []
    monkeypatch.setattr(worker, "check_config", lambda exam: None)
    monkeypatch.setattr(worker, "frozen_chunks", lambda *args: [])
    monkeypatch.setattr(ai, "retrieve", lambda *args: [])

    def grade(question, transcript, criteria, chunks, confidence):
        observed.append(criteria)
        return {"score": 5, "status": "COMPLETED", "criteria": [], "rubric_criteria": criteria}

    monkeypatch.setattr(ai, "grade", grade)
    with factory() as db:
        exam = db.get(Exam, key)
        attempts = db.scalars(
            select(Attempt).where(Attempt.session_id == session["id"]).order_by(Attempt.sequence)
        ).all()
        for i, attempt in enumerate(attempts):
            assert attempt.question["criteria"] == questions[i]["criteria"]
            attempt.finished_at = 2
            result = worker._grade_answer(db, exam, SimpleNamespace(started_at=1), attempt, "Answer", 0.9)
            assert result["rubric_scope"] == "question" and len(result["rubric_sha256"]) == 64
    assert observed == [q["criteria"] for q in questions]
