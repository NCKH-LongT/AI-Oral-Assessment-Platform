"""Immutable submission provenance, separate from replaceable review assessments."""

from sqlalchemy import select

from .models import Audit


def stt_skipped_reason(db, attempt_id):
    # Assessments can be replaced by an authorized transcription review. Keep
    # idempotency and the original missing-model reason in the append-only audit.
    details = db.scalar(select(Audit.details).where(
        Audit.event == "STT_SKIPPED",
        Audit.details["attempt_id"].as_string() == attempt_id,
    ).limit(1))
    return details.get("stt_skipped_reason") if details else None


def missing_stt_assessment(exam):
    snapshot = exam.snapshot
    return {
        "score": None,
        "confidence": None,
        "review_required": True,
        "status": "NOT_GRADED",
        "stt_status": "unavailable",
        "stt_skipped_reason": "MODEL_MISSING",
        "criteria": [],
        "retrieved_chunks": [],
        "rubric_version": snapshot["rubric_version"],
        "knowledge_version": snapshot["knowledge_version"],
        "reasoning_summary": (
            "Máy thi thiếu model Whisper cục bộ nên chưa có transcript và chưa chấm điểm. "
            "Cần giảng viên xem lại bản ghi hoặc admin yêu cầu nhận dạng lại audio gốc."
        ),
    }
