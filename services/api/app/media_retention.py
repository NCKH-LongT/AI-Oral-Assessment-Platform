"""Keep original recordings only for the latest submitted sitting per exam/student."""
import time

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import aliased

from .models import Attempt, Audit, ExamSession, ProcessingJob, Upload
from .processing import ACTIVE
from .storage_management import enqueue_media, load_selection


def tick(factory):
    newer = aliased(ExamSession)
    with factory() as db:
        ids = db.scalars(select(ExamSession.id).where(
            ExamSession.deleted_at.is_(None), ExamSession.media_removed_at.is_(None),
            ExamSession.status.in_(["COMPLETED", "REVIEW_REQUIRED"]),
            select(newer.id).where(newer.exam_id == ExamSession.exam_id,
                newer.student_id == ExamSession.student_id,
                newer.attempt_number > ExamSession.attempt_number,
                newer.deleted_at.is_(None),
                newer.status.in_(["SUBMITTED", "COMPLETED", "REVIEW_REQUIRED"])).exists(),
        ).order_by(ExamSession.created_at).limit(50)).all()
    for key in ids:
        with factory() as db:
            try:
                sessions, attempts, uploads, _ = load_selection(db, [key], lock=True)
                sitting = sessions[0]
                latest = db.scalar(select(ExamSession).where(
                    ExamSession.exam_id == sitting.exam_id, ExamSession.student_id == sitting.student_id,
                    ExamSession.attempt_number > sitting.attempt_number, ExamSession.deleted_at.is_(None),
                    ExamSession.status.in_(["SUBMITTED", "COMPLETED", "REVIEW_REQUIRED"]),
                ).order_by(ExamSession.attempt_number.desc()).with_for_update(nowait=True).limit(1))
                if not latest or sitting.media_removed_at is not None:
                    continue
                aids = [a.id for a in attempts]
                if db.scalar(select(ProcessingJob.id).where(
                    ProcessingJob.attempt_id.in_(aids), ProcessingJob.status.in_(ACTIVE)).limit(1)):
                    continue
                for upload in uploads:
                    enqueue_media(db, upload)
                db.execute(delete(Upload).where(Upload.attempt_id.in_(aids)))
                sitting.media_removed_at = time.time()
                db.add(Audit(event="SUPERSEDED_EXAM_MEDIA_CLEANUP", details={
                    "session_id": key, "retained_session_id": latest.id, "files": len(uploads),
                }))
                db.commit()
                return True
            except HTTPException as exc:
                if exc.status_code != 409:
                    raise
            except OperationalError as exc:
                if getattr(exc.orig, "sqlstate", None) != "55P03":
                    raise
    return False
