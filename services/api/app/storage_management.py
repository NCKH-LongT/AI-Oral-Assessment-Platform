"""Accounted exam media, scoped reports and previewed, transactional cleanup."""
import hashlib
import json
import os
import shutil
import time
from pathlib import Path
from typing import Literal

import jwt
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy import case, delete, func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .excel import workbook_bytes
from .models import Attempt, Audit, Course, Exam, ExamSession, MediaCleanup, ReviewJob, Upload, User
from .schemas import Input
from .security import admin, fail

router = APIRouter(prefix="/admin/storage")
FINISHED = {"COMPLETED", "REVIEW_REQUIRED"}
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def directory_bytes(path):
    total = 0
    if path.is_symlink():
        return 0
    for root, dirs, files in os.walk(path, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(root) / d).is_symlink()]
        for name in files:
            p = Path(root) / name
            try:
                if not p.is_symlink():
                    total += p.stat().st_size
            except FileNotFoundError:
                pass  # A worker/upload may remove a chunk during the scan.
    return total


def enqueue_media(db, upload):
    staging = directory_bytes(Path(settings().data_dir) / "uploads" / upload.id)
    db.add(MediaCleanup(upload_id=upload.id, storage_key=upload.storage_key,
                        byte_size=(upload.size if upload.storage_key else 0) + staging))


def media_totals():
    return (select(Attempt.session_id.label("sid"), func.count(Upload.id).label("files"),
        func.sum(case((Upload.storage_key.is_not(None), Upload.size), else_=0)).label("media_bytes"),
        func.sum(case((Upload.status != "COMPLETED", Upload.size), else_=0)).label("pending_bytes"))
        .join(Upload, Upload.attempt_id == Attempt.id).group_by(Attempt.session_id).subquery())


def report_query(course_id=None, student_id=None, before=None):
    media = media_totals()
    query = (select(ExamSession, Exam.name, Course.id, Course.code, Course.name, User.name, User.email,
                    func.coalesce(media.c.media_bytes, 0).label("media_bytes"), func.coalesce(media.c.pending_bytes, 0).label("pending_bytes"), func.coalesce(media.c.files, 0).label("files"))
             .join(Exam, Exam.id == ExamSession.exam_id).join(Course, Course.id == Exam.course_id)
             .join(User, User.id == ExamSession.student_id).outerjoin(media, media.c.sid == ExamSession.id)
             .where(ExamSession.deleted_at.is_(None)))
    if course_id:
        query = query.where(Course.id == course_id)
    if student_id:
        query = query.where(User.id == student_id)
    if before is not None:
        query = query.where(ExamSession.created_at < before)
    return query


def report_row(row):
    s, exam_name, cid, code, course_name, name, email, size, pending, files = row
    return {"id": s.id, "exam_name": exam_name, "course_id": cid, "course_code": code, "course_name": course_name,
            "student_id": s.student_id, "student_name": name, "student_email": email,
            "attempt_number": s.attempt_number, "status": s.status, "created_at": s.created_at,
            "final_score": s.final_score, "media_bytes": int(size), "pending_bytes": int(pending),
            "files": files, "media_removed_at": s.media_removed_at, "can_clean": s.status in FINISHED}


@router.get("")
def report(course_id: str | None = None, student_id: str | None = None,
           before: float | None = Query(None, gt=0, allow_inf_nan=False), page: int = Query(1, ge=1),
           limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db), user=Depends(admin)):
    query = report_query(course_id, student_id, before)
    base = query.subquery()
    total = db.scalar(select(func.count()).select_from(base))
    rows = [report_row(r) for r in db.execute(query.order_by(ExamSession.created_at.desc(), ExamSession.id).offset((page - 1) * limit).limit(limit))]
    media = media_totals()
    totals = db.execute(select(func.coalesce(func.sum(base.c.media_bytes), 0), func.coalesce(func.sum(base.c.files), 0))).one()
    # Aggregate with SQL rather than loading every sitting into application memory.
    by_course = db.execute(select(Course.id, Course.code, Course.name, func.count(ExamSession.id),
        func.coalesce(func.sum(media.c.media_bytes), 0)).join(Exam, Exam.course_id == Course.id)
        .join(ExamSession, ExamSession.exam_id == Exam.id).outerjoin(media, media.c.sid == ExamSession.id)
        .where(ExamSession.id.in_(select(base.c.id))).group_by(Course.id, Course.code, Course.name)
        .order_by(func.sum(media.c.media_bytes).desc())).all()
    by_student = db.execute(select(User.id, User.name, User.email, func.count(ExamSession.id),
        func.coalesce(func.sum(media.c.media_bytes), 0)).join(ExamSession, ExamSession.student_id == User.id)
        .outerjoin(media, media.c.sid == ExamSession.id).where(ExamSession.id.in_(select(base.c.id)))
        .group_by(User.id, User.name, User.email).order_by(func.sum(media.c.media_bytes).desc()).limit(100)).all()
    queue = db.execute(select(func.count(MediaCleanup.id), func.coalesce(func.sum(MediaCleanup.byte_size), 0),
        func.count(case((MediaCleanup.byte_size.is_(None), 1))), func.count(case((MediaCleanup.retries > 0, 1))))).one()
    root = Path(settings().data_dir)
    local = {"staging_bytes": directory_bytes(root / "uploads"),
             "objects_bytes": directory_bytes(root / "objects") if settings().storage_backend == "local" else None}
    try:
        disk = shutil.disk_usage(root)
        local.update(disk_total=disk.total, disk_free=disk.free)
    except OSError:
        local.update(disk_total=None, disk_free=None)
    return {"rows": rows, "total": total, "page": page, "limit": limit,
            "media_bytes": int(totals[0]), "files": int(totals[1]), "backend": settings().storage_backend,
            "cleanup": {"files": queue[0], "estimated_bytes": int(queue[1]), "unknown_size": queue[2], "retrying": queue[3]},
            "local": local,
            "by_course": [dict(zip(["id", "code", "name", "sessions", "bytes"], r)) for r in by_course],
            "by_student": [dict(zip(["id", "name", "email", "sessions", "bytes"], r)) for r in by_student]}


@router.get("/report.xlsx")
def export(course_id: str | None = None, student_id: str | None = None,
           before: float | None = Query(None, gt=0, allow_inf_nan=False), db: Session = Depends(get_db), user=Depends(admin)):
    query = report_query(course_id, student_id, before)
    if db.scalar(select(func.count()).select_from(query.subquery())) > 10000:
        fail(422, "REPORT_LIMIT", "Báo cáo tối đa 10.000 lần thi. Lọc theo môn/người/thời gian.")
    rows = [report_row(r) for r in db.execute(query.order_by(ExamSession.created_at.desc(), ExamSession.id))]
    fields = ["id", "course_code", "course_name", "exam_name", "student_name", "student_email", "attempt_number", "status", "media_bytes", "pending_bytes", "files", "created_at", "media_removed_at"]
    return Response(workbook_bytes(fields, [[r[k] for k in fields] for r in rows], "Exam storage"), media_type=XLSX,
                    headers={"Content-Disposition": 'attachment; filename="exam-storage.xlsx"'})


class Selection(Input):
    session_ids: list[str] = Field(min_length=1, max_length=500)
    mode: Literal["MEDIA", "ALL"] = "MEDIA"


class Confirm(Input):
    token: str = Field(max_length=100000)
    confirmation: str = Field(max_length=50)
    reason: str = Field(min_length=5, max_length=1000)


def load_selection(db, ids, lock=False):
    ids = sorted(set(ids))
    if lock:
        # NOWAIT avoids inverse lock order with upload/review workers.
        exams = select(ExamSession.exam_id).where(ExamSession.id.in_(ids))
        db.scalars(select(Exam).where(Exam.id.in_(exams)).order_by(Exam.id).with_for_update(nowait=True)).all()
    q = select(ExamSession).where(ExamSession.id.in_(ids)).order_by(ExamSession.id).execution_options(populate_existing=True)
    sessions = db.scalars(q.with_for_update(nowait=True) if lock else q).all()
    if len(sessions) != len(ids) or any(s.deleted_at is not None for s in sessions):
        fail(409, "SELECTION_CHANGED", "Danh sách lần thi đã thay đổi. Tải lại và chọn lại.")
    if any(s.status not in FINISHED for s in sessions):
        fail(409, "EXAM_ACTIVE", "Chỉ dọn lần thi đã kết thúc, không đang thi hoặc đang chấm.")
    def rows(model, predicate):
        q = select(model).where(predicate).order_by(model.id)
        return db.scalars(q.with_for_update(nowait=True) if lock else q).all()
    attempts = rows(Attempt, Attempt.session_id.in_(ids))
    aids = [a.id for a in attempts]
    reviews = rows(ReviewJob, ReviewJob.attempt_id.in_(aids))
    if any(r.status == "PENDING" for r in reviews) or any(a.status == "SUBMITTED" for a in attempts):
        fail(409, "EXAM_BUSY", "Có bài đang chấm lại. Chờ xử lý xong trước khi dọn dữ liệu.")
    uploads = rows(Upload, Upload.attempt_id.in_(aids))
    signature = hashlib.sha256(json.dumps({
        "sessions": [(s.id, s.status, s.final_score, s.ai_score, s.media_removed_at) for s in sessions],
        "uploads": [(u.id, u.size, u.status, u.storage_key) for u in uploads],
        "attempts": [(a.id, a.status) for a in attempts],
        "reviews": [(r.id, r.status) for r in reviews],
    }, sort_keys=True).encode()).hexdigest()
    return sessions, attempts, uploads, signature


@router.post("/preview")
def preview(body: Selection, db: Session = Depends(get_db), user=Depends(admin)):
    sessions, _, uploads, signature = load_selection(db, body.session_ids)
    size = sum(u.size if u.storage_key else 0 for u in uploads)
    staging = sum(directory_bytes(Path(settings().data_dir) / "uploads" / u.id) for u in uploads)
    token = jwt.encode({"purpose": "storage-cleanup", "sub": user.id, "ids": [s.id for s in sessions],
                        "mode": body.mode, "signature": signature, "exp": time.time() + 600}, settings().jwt_secret, algorithm="HS256")
    return {"token": token, "sessions": len(sessions), "files": len(uploads), "media_bytes": size,
            "staging_bytes": staging, "mode": body.mode, "confirmation": f"XOA {len(sessions)}"}


@router.post("/cleanup")
def cleanup(body: Confirm, db: Session = Depends(get_db), user=Depends(admin)):
    try:
        claim = jwt.decode(body.token, settings().jwt_secret, algorithms=["HS256"], options={"require": ["exp", "sub"]})
        if claim.get("purpose") != "storage-cleanup" or claim["sub"] != user.id:
            raise ValueError()
        selection = Selection(session_ids=claim["ids"], mode=claim["mode"])
    except (jwt.PyJWTError, ValueError, KeyError):
        fail(409, "PREVIEW_EXPIRED", "Bản xem trước hết hạn hoặc không hợp lệ. Kiểm tra lại danh sách.")
    if body.confirmation != f"XOA {len(set(selection.session_ids))}":
        fail(422, "CONFIRMATION_MISMATCH", "Nhập đúng nội dung xác nhận trong bản xem trước")
    try:
        sessions, attempts, uploads, signature = load_selection(db, selection.session_ids, lock=True)
    except OperationalError as exc:
        if getattr(exc.orig, "sqlstate", None) != "55P03":
            raise
        db.rollback()
        fail(409, "EXAM_BUSY", "Bài thi đang được xử lý. Thử lại sau.")
    if signature != claim["signature"]:
        fail(409, "SELECTION_CHANGED", "Dữ liệu đã thay đổi từ lúc xem trước. Kiểm tra lại trước khi xóa.")
    for upload in uploads:
        enqueue_media(db, upload)
    aids = [a.id for a in attempts]
    db.execute(delete(Upload).where(Upload.attempt_id.in_(aids)))
    now = time.time()
    for session in sessions:
        session.media_removed_at = now
        if selection.mode == "ALL":
            session.deleted_at, session.status = now, "DELETED"
            session.final_score = session.ai_score = session.manual_review = None
    if selection.mode == "ALL":
        db.execute(delete(ReviewJob).where(ReviewJob.attempt_id.in_(aids)))
        db.execute(delete(Attempt).where(Attempt.id.in_(aids)))
        db.execute(delete(Audit).where(Audit.event == "PROCTORING_EVENT", Audit.details["session_id"].as_string().in_(selection.session_ids)))
    db.add(Audit(user_id=user.id, event="EXAM_STORAGE_CLEANUP", details={"session_ids": selection.session_ids,
        "mode": selection.mode, "files": len(uploads), "reason": body.reason}))
    db.commit()
    return {"ok": True, "sessions": len(sessions), "files_queued": len(uploads),
            "message": "Đã ghi nhận. Worker sẽ xóa file và thử lại nếu kho lưu trữ tạm lỗi."}
