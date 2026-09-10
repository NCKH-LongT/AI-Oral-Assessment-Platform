"""Durable database queue. A transaction lock prevents duplicate workers; rollback permits crash retry."""

import logging
import time

from sqlalchemy import select

from . import ai
from .db import SessionLocal
from .documents import process_document
from .models import Attempt, Audit, Document, Exam, ExamSession

log = logging.getLogger("oral.worker")


def finalize(db, session):
    if session.status not in {"SUBMITTED", "REVIEW_REQUIRED", "COMPLETED"}:
        return
    attempts = db.scalars(select(Attempt).where(Attempt.session_id == session.id)).all()
    if not attempts or any(a.assessment is None for a in attempts):
        return
    review = any(a.assessment.get("review_required", True) for a in attempts)
    scores = [a.assessment.get("score") for a in attempts]
    session.final_score = (
        round(sum(scores) / len(scores), 2) if not review and all(s is not None for s in scores) else None
    )
    session.status = "REVIEW_REQUIRED" if review else "COMPLETED"


def tick():
    with SessionLocal() as db:
        document = db.scalar(
            select(Document)
            .where(Document.status == "PENDING")
            .order_by(Document.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if document:
            try:
                with db.begin_nested():
                    process_document(db, document)
            except Exception as exc:
                document.status = "FAILED"
                document.error = "Xử lý tài liệu thất bại. Kiểm tra định dạng và cấu hình AI rồi thử lại."
                log.warning("document_failed id=%s type=%s", document.id, type(exc).__name__)
            db.commit()
            return True
        attempt = db.scalar(
            select(Attempt)
            .where(Attempt.status == "SUBMITTED", Attempt.assessment.is_(None))
            .order_by(Attempt.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not attempt:
            return False
        session = db.get(ExamSession, attempt.session_id)
        exam = db.get(Exam, session.exam_id)
        snapshot = exam.snapshot
        try:
            if (
                snapshot["embedding_model"] != ai.embedding_name()
                or snapshot["ai_provider"] != ai.settings().ai_provider
            ):
                raise ValueError("AI configuration changed since publish")
            if (
                snapshot["llm_model"] != ai.settings().llm_model
                or snapshot["prompt_version"] != ai.PROMPT_VERSION
            ):
                raise ValueError("Model or prompt version changed since publish")
            chunks = ai.retrieve(
                db,
                exam.course_id,
                attempt.question["topic_id"],
                attempt.question["text"] + "\n" + (attempt.transcript or ""),
                snapshot["document_ids"],
            )
            attempt.assessment = ai.grade(
                attempt.question,
                attempt.transcript,
                snapshot["criteria"],
                chunks,
                (attempt.stt_confidence or 0)
                if attempt.finished_at <= session.started_at + exam.time_limit
                else 0,
            ) | {
                "rubric_version": snapshot["rubric_version"],
                "knowledge_version": snapshot["knowledge_version"],
            }
        except Exception as exc:
            attempt.assessment = {
                "score": None,
                "review_required": True,
                "confidence": 0,
                "criteria": [],
                "retrieved_chunks": [],
                "model": snapshot["llm_model"],
                "rubric_version": snapshot["rubric_version"],
                "knowledge_version": snapshot["knowledge_version"],
                "prompt_version": snapshot["prompt_version"],
                "reasoning_summary": "Chấm tự động thất bại; cần giảng viên xem lại.",
                "error": type(exc).__name__,
            }
            log.warning("grading_failed attempt=%s type=%s", attempt.id, type(exc).__name__)
        attempt.status = "GRADED"
        db.add(Audit(event="QUESTION_GRADED", details={"attempt_id": attempt.id}))
        # Serialize completion across workers grading different attempts in one session.
        db.flush()
        session = db.scalar(select(ExamSession).where(ExamSession.id == session.id).with_for_update())
        finalize(db, session)
        db.commit()
        return True


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            worked = tick()
        except Exception as exc:
            log.error("worker_error type=%s", type(exc).__name__)
            worked = False
        if not worked:
            time.sleep(2)
