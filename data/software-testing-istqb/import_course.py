"""Import authored questions with the same immutable snapshot contract as publish().

Run inside the API container. Repeated runs reuse an identical content/AI version.
A changed AI configuration creates new documents and a new exam, preserving history.
No students, enrollments or assignments are created.
"""

import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, "/app")

from sqlalchemy import select

from app import ai, storage
from app.db import SessionLocal
from app.documents import process_document
from app.knowledge import topic_data
from app.models import Audit, Chunk, Course, Document, Exam, LearningOutcome, Rubric, Topic, TopicDocument, TopicOutcome, User
from app.runtime_settings import snapshot as runtime_snapshot
from app.schemas import CourseIn, ExamIn, LOIn, QuestionOutput, RubricIn


ROOT = Path(__file__).resolve().parent


def main():
    raw = (ROOT / "assessment.json").read_bytes()
    pack = json.loads(raw)
    course_input = CourseIn.model_validate(pack["course"])
    rubric_input = RubricIn.model_validate(pack["rubric"])
    assert len(rubric_input.criteria) == 5
    assert len(pack["questions"]) == 2
    names = [c.name for c in rubric_input.criteria]
    for q in pack["questions"]:
        assert list(q["grading_checklist"]) == names
        assert all(len(items) == 4 for items in q["grading_checklist"].values())
    contents = {q["id"]: (ROOT / (q["id"] + ".txt")).read_bytes() for q in pack["questions"]}
    content_hash = hashlib.sha256(raw + b"".join(contents.values())).hexdigest()
    with runtime_snapshot(), SessionLocal() as db:
        cfg = ai.settings()
        config = {"ai_provider": cfg.ai_provider, "llm_model": cfg.llm_model,
                  "embedding_model": ai.embedding_name(), "prompt_version": ai.PROMPT_VERSION}
        version = hashlib.sha256((content_hash + json.dumps(config, sort_keys=True)).encode()).hexdigest()
        # Serialize this importer so concurrent invocations cannot duplicate a course.
        if db.bind.dialect.name == "postgresql":
            from sqlalchemy import text
            db.execute(text("SELECT pg_advisory_xact_lock(73290142)"))
        owner = db.scalar(select(User).where(User.role == "ADMIN", User.status == "ACTIVE").order_by(User.created_at))
        if owner is None:
            raise RuntimeError("Cần một tài khoản ADMIN đang hoạt động")
        course = db.scalar(select(Course).where(Course.code == course_input.code))
        if course:
            existing = db.scalars(select(Exam).where(Exam.course_id == course.id)).all()
            same = next((e for e in existing if (e.snapshot or {}).get("import_version") == version), None)
            if same:
                print(json.dumps({"result": "already_exists", "course_id": course.id,
                                  "exam_id": same.id, "ai_provider": cfg.ai_provider}))
                return
            if not any((e.snapshot or {}).get("source_bundle") == "software-testing-istqb" for e in existing):
                raise RuntimeError("Mã môn đã tồn tại ngoài bộ import; không sửa dữ liệu có sẵn")
            if course.status != "ACTIVE":
                raise RuntimeError("Môn đã lưu trữ; không tự khôi phục")
        else:
            course = Course(**course_input.model_dump(), owner_id=owner.id)
            db.add(course)
            db.flush()
        rubric = Rubric(course_id=course.id, **rubric_input.model_dump())
        db.add(rubric)
        db.flush()
        documents, questions, blueprint, scopes, mappings = [], [], [], {}, {}
        for q in pack["questions"]:
            outcomes = []
            for item in q["learning_outcomes"]:
                value = LOIn.model_validate(item)
                lo = db.scalar(select(LearningOutcome).where(LearningOutcome.course_id == course.id,
                                                            LearningOutcome.code == value.code))
                if lo is None:
                    lo = LearningOutcome(course_id=course.id, **value.model_dump())
                    db.add(lo)
                    db.flush()
                outcomes.append(lo)
            topic = db.scalar(select(Topic).where(Topic.course_id == course.id, Topic.name == q["topic"]))
            if topic is None:
                topic = Topic(course_id=course.id, name=q["topic"],
                              description="Tình huống " + q["id"] + "; tham chiếu CTFL v4.0.1, mức K3.",
                              learning_outcome_id=outcomes[0].id)
                db.add(topic)
                db.flush()
                db.add_all(TopicOutcome(topic_id=topic.id, outcome_id=lo.id) for lo in outcomes)
            filename = q["id"] + ".txt"
            key = f"documents/software-testing-istqb/{version}/{filename}"
            storage.put(key, contents[q["id"]], "text/plain; charset=utf-8")
            doc = Document(course_id=course.id, topic_id=topic.id, kind="SUPPLEMENT",
                           filename=filename, storage_key=key, embedding_model=ai.embedding_name())
            db.add(doc)
            db.flush()
            db.add(TopicDocument(topic_id=topic.id, document_id=doc.id))
            process_document(db, doc)
            db.flush()
            # Freeze only the documents imported in this version, never old variants.
            ids = list(db.scalars(select(Chunk.id).where(Chunk.document_id == doc.id)))
            if not ids or len(ids) > cfg.top_k:
                raise RuntimeError("Tài liệu phải truy xuất đủ toàn bộ chunk trong top_k hiện tại")
            scopes[topic.id] = ids
            mapping = topic_data(db, topic)
            mapping["outcomes"] = [dict(id=lo.id, code=lo.code, description=lo.description, weight=lo.weight) for lo in outcomes]
            mapping["chapters"] = []
            mappings[topic.id] = mapping
            base = QuestionOutput(text=q["text"], expected_concepts=q["expected_concepts"], reference_chunk_ids=ids).model_dump()
            questions.append(base | {"authored_id": q["id"], "topic_id": topic.id,
                "learning_outcome_id": outcomes[0].id, "learning_outcome_ids": [lo.id for lo in outcomes],
                "chapter_ids": [], "difficulty": q["difficulty"],
                "grading_reference": {"answer": q["reference_answer"], "checklist": q["grading_checklist"],
                    "test_cases": q["test_cases"], "common_errors": q["common_errors"],
                    "policy": pack["grading_policy"]}})
            blueprint.append({"topic_id": topic.id, "difficulty": q["difficulty"], "count": 1})
            documents.append(doc.id)
        body = ExamIn(course_id=course.id, rubric_id=rubric.id, blueprint=blueprint, **pack["exam"])
        body.name = f"{body.name} [{cfg.ai_provider}]"
        exam = Exam(**body.model_dump(), status="PUBLISHED", snapshot={
            "exam_version": 2, "generation_prompt_version": "authored-istqb-v1",
            "source_bundle": "software-testing-istqb", "import_version": version,
            "source": pack["source"], "content_sha256": content_hash,
            "topic_chunk_ids": scopes, "topic_mappings": mappings,
            "rubric_id": rubric.id, "rubric_version": rubric.version,
            "criteria": rubric.criteria, "document_ids": sorted(documents), "questions": questions,
            "knowledge_version": hashlib.sha256(",".join(sorted(c for ids in scopes.values() for c in ids)).encode()).hexdigest(),
            "published_at": time.time(), **config})
        db.add(exam)
        db.flush()
        # Validate the actual retrieval path used for grading, without calling the LLM.
        for q in questions:
            evidence = ai.retrieve(db, course.id, q["topic_id"], q["text"], documents, scopes[q["topic_id"]])
            assert {c["id"] for c in evidence} == set(q["reference_chunk_ids"])
        db.add(Audit(user_id=owner.id, event="COURSE_ASSESSMENT_IMPORTED",
                     details={"course_id": course.id, "exam_id": exam.id, "source_bundle": "software-testing-istqb", "version": version}))
        db.commit()
        print(json.dumps({"result": "created", "course_id": course.id, "course_code": course.code,
                          "exam_id": exam.id, "question_count": len(questions), "criteria_count": len(names),
                          "document_count": len(documents), "chunk_count": sum(map(len, scopes.values())),
                          "ai_provider": cfg.ai_provider, "grading_enabled": cfg.ai_provider != "demo"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
