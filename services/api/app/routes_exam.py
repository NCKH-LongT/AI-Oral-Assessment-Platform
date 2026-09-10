import hashlib
import math
import os
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import schemas as s
from . import storage
from .config import settings
from .db import get_db
from .models import Assignment, Attempt, Audit, Exam, ExamSession, Upload
from .security import by_id, course_access, current_user, fail, student
from .worker import finalize

router = APIRouter()


def owned_session(db, key, user, lock=False):
    session = by_id(db, ExamSession, key, lock)
    if session.student_id != user.id:
        fail(403, "FORBIDDEN", "Phiên thi không thuộc sinh viên")
    return session


def owned_attempt(db, key, user, lock=False):
    attempt = by_id(db, Attempt, key, lock)
    session = owned_session(db, attempt.session_id, user)
    return attempt, session


def active(db, session):
    if session.status != "IN_PROGRESS":
        fail(409, "EXAM_SESSION_NOT_ACTIVE", "Phiên thi không hoạt động")
    exam = by_id(db, Exam, session.exam_id)
    if time.time() > session.started_at + exam.time_limit:
        fail(409, "EXAM_EXPIRED", "Đã hết giờ. Bạn có thể nộp bài để giảng viên xem lại.")


def public_session(db, session):
    exam = by_id(db, Exam, session.exam_id)
    attempts = db.scalars(
        select(Attempt).where(Attempt.session_id == session.id).order_by(Attempt.sequence)
    ).all()
    first = next((a for a in attempts if a.status in {"READY", "STARTED"}), None)
    return {
        "id": session.id,
        "exam_name": exam.name,
        "status": session.status,
        "started_at": session.started_at,
        "time_limit": exam.time_limit,
        "server_time": time.time(),
        "final_score": session.final_score,
        "question_count": len(attempts),
        "answered_count": sum(a.status in {"SUBMITTED", "GRADED"} for a in attempts),
        "current_attempt": (
            {
                "id": first.id,
                "sequence": first.sequence,
                "text": first.question["text"],
                "status": first.status,
            }
            if first and session.status == "IN_PROGRESS"
            else None
        ),
    }


@router.get("/exams/available")
def available(db: Session = Depends(get_db), user=Depends(student)):
    exams = db.scalars(
        select(Exam).join(Assignment).where(Assignment.student_id == user.id, Exam.status == "PUBLISHED")
    ).all()
    result = []
    for exam in exams:
        session = db.scalar(
            select(ExamSession).where(ExamSession.exam_id == exam.id, ExamSession.student_id == user.id)
        )
        result.append(
            {
                "id": exam.id,
                "name": exam.name,
                "time_limit": exam.time_limit,
                "question_count": len(exam.snapshot["questions"]),
                "session_id": session.id if session else None,
                "status": session.status if session else "ASSIGNED",
            }
        )
    return result


@router.post("/exam-sessions")
def create_session(body: s.SessionIn, db: Session = Depends(get_db), user=Depends(student)):
    exam = by_id(db, Exam, body.exam_id, lock=True)
    if exam.status != "PUBLISHED" or not db.scalar(
        select(Assignment).where(Assignment.exam_id == exam.id, Assignment.student_id == user.id)
    ):
        fail(403, "NOT_ASSIGNED", "Bạn chưa được giao bài thi này")
    existing = db.scalar(
        select(ExamSession).where(ExamSession.exam_id == exam.id, ExamSession.student_id == user.id)
    )
    if existing:
        return public_session(db, existing)
    session = ExamSession(exam_id=exam.id, student_id=user.id)
    db.add(session)
    db.flush()
    for index, question in enumerate(exam.snapshot["questions"]):
        db.add(Attempt(session_id=session.id, sequence=index + 1, question=question))
    db.commit()
    return public_session(db, session)


@router.get("/exam-sessions/{key}")
def get_session(key: str, db: Session = Depends(get_db), user=Depends(student)):
    return public_session(db, owned_session(db, key, user))


@router.post("/exam-sessions/{key}/start")
def start_session(key: str, db: Session = Depends(get_db), user=Depends(student)):
    session = owned_session(db, key, user, lock=True)
    if session.status == "DEVICE_CHECK":
        session.status, session.started_at = "IN_PROGRESS", time.time()
        db.add(Audit(user_id=user.id, event="START_EXAM", details={"session_id": key}))
        db.commit()
    elif session.status != "IN_PROGRESS":
        fail(409, "INVALID_STATE", "Không thể bắt đầu lại bài đã nộp")
    return public_session(db, session)


@router.post("/question-attempts/{key}/start")
def start_attempt(key: str, db: Session = Depends(get_db), user=Depends(student)):
    attempt, session = owned_attempt(db, key, user, lock=True)
    active(db, session)
    earlier = db.scalar(
        select(Attempt).where(
            Attempt.session_id == session.id,
            Attempt.sequence < attempt.sequence,
            Attempt.status.in_(["READY", "STARTED"]),
        )
    )
    if earlier:
        fail(409, "QUESTION_ORDER", "Hãy trả lời câu trước")
    if attempt.status == "READY":
        attempt.status, attempt.started_at = "STARTED", time.time()
        db.add(Audit(user_id=user.id, event="START_QUESTION", details={"attempt_id": key}))
        db.commit()
    elif attempt.status != "STARTED":
        fail(409, "INVALID_STATE", "Câu trả lời đã được nộp")
    return {"status": attempt.status}


@router.post("/question-attempts/{key}/submit")
def submit(
    key: str,
    body: s.TranscriptIn,
    idempotency_key: str = Header(min_length=8, max_length=100),
    db: Session = Depends(get_db),
    user=Depends(student),
):
    attempt, session = owned_attempt(db, key, user, lock=True)
    if attempt.submit_key:
        if (
            attempt.submit_key == idempotency_key
            and attempt.transcript == body.transcript
            and attempt.stt_confidence == body.stt_confidence
        ):
            return {"status": attempt.status}
        fail(409, "ALREADY_SUBMITTED", "Câu trả lời đã được nộp")
    # A started answer may arrive after the deadline; preserve it for review, never lose its transcript.
    if session.status != "IN_PROGRESS" or attempt.status != "STARTED":
        fail(409, "INVALID_STATE", "Câu trả lời chưa bắt đầu hoặc bài đã nộp")
    attempt.transcript, attempt.stt_confidence = body.transcript, body.stt_confidence
    attempt.submit_key, attempt.finished_at, attempt.status = idempotency_key, time.time(), "SUBMITTED"
    db.add(Audit(user_id=user.id, event="TRANSCRIPT_SUBMITTED", details={"attempt_id": key}))
    db.commit()
    return {"status": attempt.status}


@router.post("/exam-sessions/{key}/finish")
def finish(key: str, db: Session = Depends(get_db), user=Depends(student)):
    session = owned_session(db, key, user, lock=True)
    if session.status in {"SUBMITTED", "COMPLETED", "REVIEW_REQUIRED"}:
        return public_session(db, session)
    if session.status != "IN_PROGRESS":
        fail(409, "INVALID_STATE", "Bài thi chưa bắt đầu")
    attempts = db.scalars(select(Attempt).where(Attempt.session_id == key)).all()
    exam = by_id(db, Exam, session.exam_id)
    expired = time.time() > session.started_at + exam.time_limit
    if any(a.status in {"READY", "STARTED"} for a in attempts) and not expired:
        fail(409, "INCOMPLETE", "Cần trả lời đủ câu trước khi nộp bài")
    if expired:
        for a in attempts:
            if a.status in {"READY", "STARTED"}:
                a.status = "GRADED"
                a.assessment = {
                    "score": None,
                    "review_required": True,
                    "confidence": 0,
                    "reasoning_summary": "Hết giờ, chưa có câu trả lời.",
                }
    # Evidence is required for each submitted voice answer.
    for a in attempts:
        if a.transcript:
            kinds = set(
                db.scalars(select(Upload.kind).where(Upload.attempt_id == a.id, Upload.status == "COMPLETED"))
            )
            if not {"AUDIO", "VIDEO"} <= kinds:
                fail(409, "EVIDENCE_PENDING", "Chờ tải đủ audio/video trước khi nộp bài")
    session.status, session.completed_at = "SUBMITTED", time.time()
    db.flush()
    finalize(db, session)
    db.add(Audit(user_id=user.id, event="FINISH_EXAM", details={"session_id": key}))
    db.commit()
    return public_session(db, session)


@router.post("/uploads/init")
def init_upload(body: s.UploadIn, db: Session = Depends(get_db), user=Depends(student)):
    attempt, session = owned_attempt(db, body.attempt_id, user)
    if attempt.status == "READY" or session.status != "IN_PROGRESS":
        fail(409, "INVALID_STATE", "Chỉ upload khi câu trả lời đã bắt đầu và bài chưa nộp")
    if not body.mime_type.startswith(body.kind.lower() + "/"):
        fail(422, "MIME_MISMATCH", "Loại file không khớp evidence")
    if body.size > settings().max_media_mb * 1024 * 1024:
        fail(413, "MEDIA_TOO_LARGE", "Media quá lớn")
    existing = db.scalar(
        select(Upload).where(
            Upload.attempt_id == attempt.id,
            Upload.kind == body.kind,
            Upload.sha256 == body.sha256,
            Upload.size == body.size,
        )
    )
    if existing:
        return {"id": existing.id, "chunk_size": settings().media_chunk_bytes, "status": existing.status}
    row = Upload(**body.model_dump(), total_chunks=math.ceil(body.size / settings().media_chunk_bytes))
    db.add(row)
    db.flush()
    db.add(Audit(user_id=user.id, event="UPLOAD_STARTED", details={"upload_id": row.id}))
    db.commit()
    return {"id": row.id, "chunk_size": settings().media_chunk_bytes, "status": row.status}


def upload_folder(key):
    # key is always a UUID loaded from the database, never a client file path.
    folder = Path(settings().data_dir) / "uploads" / key
    folder.mkdir(parents=True, exist_ok=True)
    return folder


@router.put("/uploads/{key}/chunks/{index}")
async def chunk(
    key: str,
    index: int,
    request: Request,
    x_chunk_sha256: str = Header(),
    db: Session = Depends(get_db),
    user=Depends(student),
):
    row = by_id(db, Upload, key, lock=True)
    owned_attempt(db, row.attempt_id, user)
    if row.status == "COMPLETED":
        fail(409, "COMPLETED", "Upload đã hoàn tất")
    if not 0 <= index < row.total_chunks:
        fail(422, "CHUNK_INDEX", "Chunk index không hợp lệ")
    expected = min(settings().media_chunk_bytes, row.size - index * settings().media_chunk_bytes)
    content = bytearray()
    async for part in request.stream():
        content.extend(part)
        if len(content) > expected:
            fail(413, "CHUNK_SIZE", "Chunk quá lớn")
    if len(content) != expected or hashlib.sha256(content).hexdigest() != x_chunk_sha256:
        fail(422, "CHECKSUM_MISMATCH", "Kích thước hoặc checksum chunk không khớp")
    folder = upload_folder(row.id)
    with tempfile.NamedTemporaryFile(dir=folder, delete=False) as temp:
        temp.write(content)
        tmp = temp.name
    os.replace(tmp, folder / str(index))
    db.commit()
    return {"ok": True, "index": index}


@router.get("/uploads/{key}/status")
def upload_status(key: str, db: Session = Depends(get_db), user=Depends(student)):
    row = by_id(db, Upload, key)
    owned_attempt(db, row.attempt_id, user)
    return {
        "status": row.status,
        "received_chunks": sorted(int(p.name) for p in upload_folder(row.id).iterdir() if p.name.isdigit()),
        "total_chunks": row.total_chunks,
    }


@router.post("/uploads/{key}/complete")
def complete(key: str, db: Session = Depends(get_db), user=Depends(student)):
    row = by_id(db, Upload, key, lock=True)
    owned_attempt(db, row.attempt_id, user)
    if row.status == "COMPLETED":
        return {"status": row.status}
    folder = upload_folder(row.id)
    if any(not (folder / str(i)).is_file() for i in range(row.total_chunks)):
        fail(409, "MISSING_CHUNKS", "Thiếu chunk")
    content = b"".join((folder / str(i)).read_bytes() for i in range(row.total_chunks))
    if len(content) != row.size or hashlib.sha256(content).hexdigest() != row.sha256:
        fail(422, "CHECKSUM_MISMATCH", "Checksum toàn file không khớp")
    if not (content.startswith(b"\x1aE\xdf\xa3") or content.startswith(b"OggS") or content[4:8] == b"ftyp"):
        fail(422, "INVALID_MEDIA", "Container media không hợp lệ")
    row.storage_key = f"evidence/{row.id}"
    storage.put(row.storage_key, content, row.mime_type)
    row.status = "COMPLETED"
    db.add(Audit(user_id=user.id, event="UPLOAD_COMPLETED", details={"upload_id": row.id}))
    db.commit()
    for part in folder.iterdir():
        part.unlink(missing_ok=True)
    return {"status": row.status}


@router.get("/evidence/{key}/content")
def evidence(key: str, request: Request, db: Session = Depends(get_db), user=Depends(current_user)):
    row = by_id(db, Upload, key)
    attempt = by_id(db, Attempt, row.attempt_id)
    session = by_id(db, ExamSession, attempt.session_id)
    if user.role == "STUDENT":
        owned_session(db, session.id, user)
    else:
        course_access(db, by_id(db, Exam, session.exam_id).course_id, user)
    if row.status != "COMPLETED":
        fail(409, "NOT_READY", "Evidence chưa sẵn sàng")
    start, end, status = 0, row.size - 1, 200
    raw = request.headers.get("range")
    if raw:
        try:
            unit, interval = raw.split("=", 1)
            left, right = interval.split("-", 1)
            if unit != "bytes" or "," in interval:
                raise ValueError()
            if left:
                start = int(left)
                end = min(int(right), end) if right else end
            else:
                start = max(0, row.size - int(right))
            if start < 0 or start > end or start >= row.size:
                raise ValueError()
            status = 206
        except ValueError:
            fail(416, "INVALID_RANGE", "Range không hợp lệ")

    def stream():
        body = storage.open_stream(row.storage_key)
        try:
            remaining_skip = start
            while remaining_skip:
                part = body.read(min(65536, remaining_skip))
                if not part:
                    return
                remaining_skip -= len(part)
            remaining = end - start + 1
            while remaining:
                part = body.read(min(65536, remaining))
                if not part:
                    return
                remaining -= len(part)
                yield part
        finally:
            body.close()

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Cache-Control": "private, no-store",
    }
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{row.size}"
    return StreamingResponse(stream(), status_code=status, media_type=row.mime_type, headers=headers)
