"""Attempt limits count visible sittings; deleted ordinals are never reused."""

from sqlalchemy import select

from .models import Assignment, ExamSession

ACTIVE = {"DEVICE_CHECK", "IN_PROGRESS"}


def sessions_for(db, exam_id, student_id):
    return db.scalars(
        select(ExamSession)
        .where(
            ExamSession.exam_id == exam_id,
            ExamSession.student_id == student_id,
            ExamSession.deleted_at.is_(None),
        )
        .order_by(ExamSession.attempt_number.desc())
    ).all()


def allowance(db, exam, student_id, sessions=None):
    sessions = sessions if sessions is not None else sessions_for(db, exam.id, student_id)
    extra = (
        db.scalar(
            select(Assignment.extra_attempts).where(
                Assignment.exam_id == exam.id,
                Assignment.student_id == student_id,
            )
        )
        or 0
    )
    maximum = None if exam.max_attempts is None else exam.max_attempts + extra
    remaining = None if maximum is None else max(0, maximum - len(sessions))
    return {
        "attempt_count": len(sessions),
        "max_attempts": maximum,
        "extra_attempts": extra,
        "remaining_attempts": remaining,
        "can_start_new": not any(s.status in ACTIVE for s in sessions)
        and (remaining is None or remaining > 0),
    }


def history_row(session):
    return {
        "id": session.id,
        "attempt_number": session.attempt_number,
        "status": session.status,
        "created_at": session.created_at,
        "started_at": session.started_at,
        "completed_at": session.completed_at,
        "final_score": session.final_score if session.status == "COMPLETED" else None,
    }
