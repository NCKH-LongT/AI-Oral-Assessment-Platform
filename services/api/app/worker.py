"""Durable database queue. A transaction lock prevents duplicate workers; rollback permits crash retry."""

import hashlib
import logging
import tempfile
import time
from pathlib import Path

from sqlalchemy import select

from . import ai, speech, storage
from .db import SessionLocal
from .documents import process_document
from .models import Attempt, Audit, Chunk, Document, Exam, ExamSession, ReviewJob, Upload

log = logging.getLogger("oral.worker")


def finalize(db, session):
    if session.status not in {"SUBMITTED", "REVIEW_REQUIRED", "COMPLETED"}:
        return
    attempts = db.scalars(select(Attempt).where(Attempt.session_id == session.id)).all()
    if not attempts or any(a.assessment is None for a in attempts):
        return
    if db.scalar(
        select(ReviewJob.id)
        .join(Attempt)
        .where(Attempt.session_id == session.id, ReviewJob.status == "PENDING")
        .limit(1)
    ):
        session.status, session.final_score = "REVIEW_REQUIRED", None
        return
    review = any(a.assessment.get("review_required", True) for a in attempts)
    scores = [a.assessment.get("score") for a in attempts]
    session.final_score = (
        round(sum(scores) / len(scores), 2) if not review and all(s is not None for s in scores) else None
    )
    session.status = "REVIEW_REQUIRED" if review else "COMPLETED"


def frozen_chunks(db, exam, attempt):
    snapshot = exam.snapshot
    if "topic_chunk_ids" in snapshot:
        return snapshot["topic_chunk_ids"].get(attempt.question["topic_id"], [])
    # Published MVP exams used the legacy fixed topic column, not today's mappings.
    return list(
        db.scalars(
            select(Chunk.id).where(
                Chunk.course_id == exam.course_id,
                Chunk.topic_id == attempt.question["topic_id"],
                Chunk.document_id.in_(snapshot["document_ids"]),
            )
        )
    )


def grade_answer(db, exam, session, attempt, transcript, confidence):
    snapshot = exam.snapshot
    if (
        snapshot["embedding_model"] != ai.embedding_name()
        or snapshot["ai_provider"] != ai.settings().ai_provider
        or snapshot["llm_model"] != ai.settings().llm_model
        or snapshot["prompt_version"] != ai.PROMPT_VERSION
    ):
        raise ValueError("AI configuration changed since publish")
    chunks = ai.retrieve(
        db,
        exam.course_id,
        attempt.question["topic_id"],
        attempt.question["text"] + "\n" + (transcript or ""),
        snapshot["document_ids"],
        frozen_chunks(db, exam, attempt),
    )
    return ai.grade(
        attempt.question,
        transcript,
        snapshot["criteria"],
        chunks,
        confidence if attempt.finished_at <= session.started_at + exam.time_limit else 0,
    ) | {"rubric_version": snapshot["rubric_version"], "knowledge_version": snapshot["knowledge_version"]}


def process_review(db, job):
    attempt = db.scalar(select(Attempt).where(Attempt.id == job.attempt_id).with_for_update())
    session = db.get(ExamSession, attempt.session_id)
    exam = db.get(Exam, session.exam_id)
    try:
        audio = db.get(Upload, job.original["audio_id"])
        if not audio or audio.sha256 != job.original["audio_sha256"] or audio.status != "COMPLETED":
            raise ValueError("Original evidence changed")
        with tempfile.TemporaryDirectory(prefix="oral-review-") as folder:
            path = Path(folder) / "original.webm"
            original = storage.get(audio.storage_key)
            if hashlib.sha256(original).hexdigest() != audio.sha256:
                raise ValueError("Original audio checksum mismatch")
            path.write_bytes(original)
            transcript = speech.transcribe_file(path, job.policy)
        assessment = grade_answer(
            db, exam, session, attempt, transcript["transcript"], transcript["stt_confidence"]
        )
        job.result = transcript | {"assessment": assessment}
        # The submitted transcript and idempotency payload remain immutable.
        attempt.assessment = assessment
        job.status = "COMPLETED"
    except Exception as exc:
        job.status = "FAILED"
        job.error = "Nhận dạng/chấm lại thất bại. Đánh giá trước được giữ nguyên; kiểm tra cấu hình Google và AI rồi thử lại."
        log.warning("review_failed id=%s type=%s", job.id, type(exc).__name__)
    job.completed_at = time.time()
    db.add(
        Audit(
            user_id=job.requested_by,
            event="GOOGLE_REVIEW_" + job.status,
            details={"job_id": job.id, "attempt_id": attempt.id},
        )
    )
    db.flush()
    session = db.scalar(select(ExamSession).where(ExamSession.id == session.id).with_for_update())
    finalize(db, session)


def tick():
    with SessionLocal() as db:
        job = db.scalar(
            select(ReviewJob)
            .where(ReviewJob.status == "PENDING")
            .order_by(ReviewJob.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if job:
            process_review(db, job)
            db.commit()
            return True
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
            attempt.assessment = grade_answer(
                db, exam, session, attempt, attempt.transcript, attempt.stt_confidence or 0
            )
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
