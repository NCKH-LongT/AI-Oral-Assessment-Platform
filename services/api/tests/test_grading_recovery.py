from copy import deepcopy

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from test_mvp import ok, prepare, start, upload

from app import ai, worker
from app.grading import assessment_view
from app.models import Attempt, Chunk, Document, Exam, ExamSession, ReviewJob


def failed_submission(env, monkeypatch):
    context = prepare(env, 1)
    session = start(env, context)
    aid = session["current_attempt"]["id"]
    student = env[0]["student"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    ok(student.post(f"/question-attempts/{aid}/submit",
                    json={"transcript": "Original submitted answer", "stt_confidence": 0.96},
                    headers={"Idempotency-Key": "grading-recovery"}))
    upload(student, aid, "AUDIO")
    upload(student, aid, "VIDEO")
    ok(student.post(f"/exam-sessions/{session['id']}/finish"))
    cfg = ai.settings().model_copy(update={"ai_provider": "gemini", "gemini_api_key": "test-only"})
    monkeypatch.setattr(ai, "settings", lambda: cfg)
    monkeypatch.setattr(ai, "embed", lambda *a, **kw: [1.0] + [0.0] * 767)
    assert worker.tick()
    return context, session, aid


def compatible_target(env, context):
    with env[1]() as db:
        source = db.get(Exam, context["exam"]["id"])
        snap = deepcopy(source.snapshot)
        q = snap["questions"][0]
        old_chunk = db.get(Chunk, q["reference_chunk_ids"][0])
        document = Document(course_id=source.course_id, topic_id=q["topic_id"], filename="new.txt",
                            storage_key="test-only", status="READY", embedding_model=ai.embedding_name())
        db.add(document)
        db.flush()
        chunk = Chunk(course_id=source.course_id, topic_id=q["topic_id"], document_id=document.id,
                      page=1, content=old_chunk.content, embedding=[1.0] + [0.0] * 767)
        db.add(chunk)
        db.flush()
        q["reference_chunk_ids"] = [chunk.id]
        snap.update(ai_provider="gemini", embedding_model=ai.embedding_name(),
                    document_ids=[document.id], topic_chunk_ids={q["topic_id"]: [chunk.id]},
                    knowledge_version="new-version")
        target = Exam(course_id=source.course_id, rubric_id=source.rubric_id, name="Gemini version",
                      time_limit=source.time_limit, blueprint=source.blueprint, status="PUBLISHED", snapshot=snap)
        db.add(target)
        db.commit()
        return target.id, chunk.id


def test_mismatch_has_no_confidence_and_legacy_read_does_not_mutate(env, monkeypatch):
    context, session, aid = failed_submission(env, monkeypatch)
    with env[1]() as db:
        a = db.get(Attempt, aid)
        assert a.assessment["confidence"] is None
        assert a.assessment["error_code"] == "AI_CONFIG_MISMATCH"
        assert a.assessment["status"] == "FAILED"
        assert a.assessment["criteria"] == []
        assert db.get(ExamSession, session["id"]).status == "REVIEW_REQUIRED"
        old = {"error": "ValueError", "score": None, "confidence": 0}
        normalized = assessment_view(old, db.get(Exam, context["exam"]["id"]))
        assert normalized["confidence"] is None and normalized["error_code"] == "AI_CONFIG_MISMATCH"
        assert old["confidence"] == 0
        assert assessment_view({"score": 2, "confidence": 0}, db.get(Exam, context["exam"]["id"]))["confidence"] == 0
    # Reject before expensive STT, even when its credential is not configured.
    response = env[0]["admin"].post(f"/admin/attempts/{aid}/google-review", json={"reason": "Retry grading"})
    assert response.status_code == 409 and response.json()["error"]["code"] == "AI_CONFIG_MISMATCH"


def test_grade_review_preserves_answer_and_history_with_new_evidence(env, monkeypatch):
    context, session, aid = failed_submission(env, monkeypatch)
    target_id, chunk_id = compatible_target(env, context)
    path = f"/admin/attempts/{aid}/grade-review"
    body = {"target_exam_id": target_id, "reason": "Use the configured grading version"}
    for role in ("teacher", "student", "reviewer", "outsider"):
        assert env[0][role].post(path, json=body).status_code == 403
    job = ok(env[0]["admin"].post(path, json=body), 202)
    assert ok(env[0]["admin"].post(path, json=body), 202)["id"] == job["id"]

    def grade(question, transcript, criteria, chunks, confidence):
        assert transcript == "Original submitted answer" and confidence == 0.96
        assert question["reference_chunk_ids"] == [chunk_id]
        assert [c["id"] for c in chunks] == [chunk_id]
        return {"score": 8, "confidence": 0.93, "criteria": [], "review_required": False,
                "model": "test-model", "status": "COMPLETED"}

    monkeypatch.setattr(ai, "grade", grade)
    monkeypatch.setattr(worker.speech, "transcribe_file", lambda *a: (_ for _ in ()).throw(AssertionError("Must not call STT")))
    assert worker.tick()
    with env[1]() as db:
        a = db.get(Attempt, aid)
        j = db.get(ReviewJob, job["id"])
        assert a.transcript == j.original["transcript"] == "Original submitted answer"
        assert a.stt_confidence == 0.96
        assert j.original["assessment"]["error_code"] == "AI_CONFIG_MISMATCH"
        assert j.status == "COMPLETED" and a.assessment["score"] == 8
        assert a.assessment["grading_exam_id"] == target_id
        assert a.assessment["review_required"] is True
        assert db.get(Exam, context["exam"]["id"]).snapshot["ai_provider"] == "demo"
        assert db.get(ExamSession, session["id"]).final_score is None


def test_target_validation_and_failed_retry_preserve_result(env, monkeypatch):
    context, session, aid = failed_submission(env, monkeypatch)
    target_id, _ = compatible_target(env, context)
    admin = env[0]["admin"]
    path = f"/admin/attempts/{aid}/grade-review"
    with env[1]() as db:
        target = db.get(Exam, target_id)
        original = deepcopy(target.snapshot)
        altered = deepcopy(original)
        altered["criteria"][0]["weight"] = 99
        target.snapshot = altered
        db.commit()
    body = {"target_exam_id": target_id, "reason": "Retry after config repair"}
    assert admin.post(path, json=body).status_code == 409
    with env[1]() as db:
        target = db.get(Exam, target_id)
        altered = deepcopy(original)
        altered["questions"][0]["text"] = "A different question"
        target.snapshot = altered
        db.commit()
    assert admin.post(path, json=body).status_code == 409
    with env[1]() as db:
        db.get(Exam, target_id).snapshot = original
        db.commit()
    job = ok(admin.post(path, json=body), 202)
    monkeypatch.setattr(ai, "grade", lambda *a: (_ for _ in ()).throw(RuntimeError("secret-token-never-log")))
    assert worker.tick()
    with env[1]() as db:
        j = db.get(ReviewJob, job["id"])
        assert j.status == "FAILED" and "secret-token" not in j.error
        assert db.get(Attempt, aid).assessment == j.original["assessment"]
        assert len(list(db.scalars(select(ReviewJob)))) == 1


def test_block_new_start_after_config_change(env, monkeypatch):
    context = prepare(env, 1)
    student = env[0]["student"]
    device_session = ok(student.post("/exam-sessions", json={"exam_id": context["exam"]["id"]}))
    cfg = ai.settings().model_copy(update={"llm_model": "changed-model"})
    monkeypatch.setattr(ai, "settings", lambda: cfg)
    response = student.post(f"/exam-sessions/{device_session['id']}/start")
    assert response.status_code == 409 and response.json()["error"]["code"] == "AI_CONFIG_MISMATCH"


def test_demo_confidence_is_unavailable():
    result = ai.grade({}, "answer", [], [], 1)
    assert result["confidence"] is None and result["status"] == "NOT_GRADED"


def test_provider_schema_uses_rubric_scale_names_and_real_references():
    schema = ai.grading_schema([{"name": "Criterion A", "max_score": 2}], [{"id": "real-chunk"}])
    value = {"confidence": 0.9, "criteria": [{"name": "Criterion A", "score": 1.5, "comment": "3/4 items"}],
             "missing_concepts": [], "reasoning_summary": "Grounded", "reference_chunk_ids": ["real-chunk"]}
    assert schema.model_validate(value).model_dump(mode="json")["criteria"][0]["score"] == 1.5
    wire_schema = schema.model_json_schema()
    assert wire_schema["$defs"]["BoundGradeCriterion"]["properties"]["score"]["maximum"] == 2
    for field, invalid in [("score", 75), ("name", "Made up criterion")]:
        broken = deepcopy(value)
        broken["criteria"][0][field] = invalid
        with pytest.raises(ValidationError):
            schema.model_validate(broken)
    value["reference_chunk_ids"] = ["invented-chunk"]
    with pytest.raises(ValidationError):
        schema.model_validate(value)
