"""Build a frozen exam snapshot without publishing or committing it."""
import hashlib
import time

from sqlalchemy import select

from . import ai
from .knowledge import chunk_scope, topic_data
from .models import BookSection, Document, LearningOutcome, Rubric, Topic
from .runtime_settings import settings
from .security import by_id, fail


def data(row, *fields):
    return {k: getattr(row, k) for k in ("id", *fields)}


def build_snapshot(db, exam):
    rubric = by_id(db, Rubric, exam.rubric_id)
    docs = db.scalars(
        select(Document).where(
            Document.course_id == exam.course_id,
            Document.status == "READY",
            Document.embedding_model == ai.embedding_name(),
        )
    ).all()
    if not docs:
        fail(409, "KNOWLEDGE_NOT_READY", "Cần tài liệu READY với cấu hình embedding hiện tại")
    questions = []
    topic_scopes = {}
    mappings = {}
    for row in exam.blueprint:
        topic = by_id(db, Topic, row["topic_id"])
        topic_scopes[topic.id] = chunk_scope(db, exam.course_id, topic.id, ai.embedding_name())
        mappings[topic.id] = topic_data(db, topic)
        mappings[topic.id]["outcomes"] = [
            data(by_id(db, LearningOutcome, lo), "code", "description", "weight")
            for lo in mappings[topic.id]["learning_outcome_ids"]
        ]
        mappings[topic.id]["chapters"] = [
            data(by_id(db, BookSection, chapter), "title", "level", "start_page", "end_page")
            for chapter in mappings[topic.id]["chapter_ids"]
        ]
        chunks = ai.retrieve(
            db, exam.course_id, topic.id, topic.name, [d.id for d in docs], topic_scopes[topic.id]
        )
        if not chunks:
            fail(409, "NO_EVIDENCE", f"Chủ đề {topic.name} chưa có tài liệu READY")
        for _ in range(row["count"]):
            question = ai.generate_question(
                topic,
                row["difficulty"],
                chunks,
                [q["text"] for q in questions],
                outcomes=mappings[topic.id]["outcomes"],
            )
            questions.append(
                question
                | {
                    "topic_id": topic.id,
                    "learning_outcome_id": topic.learning_outcome_id,
                    "learning_outcome_ids": mappings[topic.id]["learning_outcome_ids"],
                    "chapter_ids": mappings[topic.id]["chapter_ids"],
                    "difficulty": row["difficulty"],
                }
            )
    doc_ids = sorted(d.id for d in docs)
    return {
        "exam_version": 2,
        "generation_prompt_version": "topic-los-english-terms-v3",
        "topic_chunk_ids": topic_scopes,
        "topic_mappings": mappings,
        "rubric_id": rubric.id,
        "rubric_version": rubric.version,
        "criteria": rubric.criteria,
        "document_ids": doc_ids,
        "questions": questions,
        "knowledge_version": hashlib.sha256(
            ",".join(sorted({c for ids in topic_scopes.values() for c in ids})).encode()
        ).hexdigest(),
        "ai_provider": settings().ai_provider,
        "llm_model": settings().llm_model,
        "embedding_model": ai.embedding_name(),
        "prompt_version": ai.PROMPT_VERSION,
        "published_at": time.time(),
    }
