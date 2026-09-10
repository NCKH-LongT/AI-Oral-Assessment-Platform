import hashlib
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import ai, storage
from . import schemas as s
from .config import settings
from .db import get_db
from .models import (
    Assignment,
    Attempt,
    Audit,
    Course,
    Document,
    Exam,
    ExamSession,
    LearningOutcome,
    Rubric,
    Topic,
    Upload,
    User,
    uid,
)
from .security import admin, by_id, course_access, editor, fail, hasher, public_user, staff

router = APIRouter()


def data(row, *fields):
    return {k: getattr(row, k) for k in ("id", *fields)}


def course_list(db, user):
    query = select(Course).order_by(Course.created_at.desc())
    if user.role == "TEACHER":
        query = query.where(Course.owner_id == user.id)
    return db.scalars(query).all()


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user=Depends(staff)):
    ids = [c.id for c in course_list(db, user)]
    return {
        "courses": len(ids),
        "exams": db.scalar(select(func.count()).select_from(Exam).where(Exam.course_id.in_(ids))),
        "documents": db.scalar(select(func.count()).select_from(Document).where(Document.course_id.in_(ids))),
        "sessions": db.scalar(
            select(func.count()).select_from(ExamSession).join(Exam).where(Exam.course_id.in_(ids))
        ),
        "ai_provider": settings().ai_provider,
    }


@router.get("/users")
def users(db: Session = Depends(get_db), user=Depends(staff)):
    query = select(User).order_by(User.created_at.desc())
    if user.role != "ADMIN":
        query = query.where(User.role == "STUDENT")
    return [public_user(u) for u in db.scalars(query)]


@router.post("/users", status_code=201)
def create_user(body: s.UserIn, db: Session = Depends(get_db), user=Depends(admin)):
    row = User(**body.model_dump(exclude={"password"}), password_hash=hasher.hash(body.password))
    db.add(row)
    db.add(Audit(user_id=user.id, event="USER_CREATED", details={"username": row.username}))
    db.commit()
    return public_user(row)


@router.get("/courses")
def courses(db: Session = Depends(get_db), user=Depends(staff)):
    return [data(c, "code", "name", "description", "status", "owner_id") for c in course_list(db, user)]


@router.post("/courses", status_code=201)
def create_course(body: s.CourseIn, db: Session = Depends(get_db), user=Depends(editor)):
    row = Course(**body.model_dump(), owner_id=user.id)
    db.add(row)
    db.commit()
    return data(row, "code", "name", "description", "status")


@router.put("/courses/{course_id}")
def update_course(course_id: str, body: s.CourseIn, db: Session = Depends(get_db), user=Depends(editor)):
    row = course_access(db, course_id, user)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return data(row, "code", "name", "description", "status")


@router.delete("/courses/{course_id}")
def archive_course(course_id: str, db: Session = Depends(get_db), user=Depends(editor)):
    row = course_access(db, course_id, user)
    row.status = "ARCHIVED"
    db.commit()
    return {"status": "ARCHIVED"}


@router.get("/courses/{course_id}/workspace")
def workspace(course_id: str, db: Session = Depends(get_db), user=Depends(staff)):
    course_access(db, course_id, user)

    def rows(model, *fields):
        return [
            data(r, *fields)
            for r in db.scalars(select(model).where(model.course_id == course_id).order_by(model.created_at))
        ]

    return {
        "outcomes": rows(LearningOutcome, "code", "description", "weight"),
        "topics": rows(Topic, "name", "description", "learning_outcome_id"),
        "documents": rows(Document, "filename", "status", "error", "topic_id", "version", "embedding_model"),
        "rubrics": rows(Rubric, "name", "version", "criteria"),
        "exams": rows(Exam, "name", "status", "blueprint", "time_limit", "rubric_id"),
    }


@router.post("/courses/{course_id}/outcomes", status_code=201)
def create_outcome(course_id: str, body: s.LOIn, db: Session = Depends(get_db), user=Depends(editor)):
    course_access(db, course_id, user)
    row = LearningOutcome(course_id=course_id, **body.model_dump())
    db.add(row)
    db.commit()
    return data(row, "code", "description", "weight")


@router.put("/outcomes/{key}")
def update_outcome(key: str, body: s.LOIn, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, LearningOutcome, key)
    course_access(db, row.course_id, user)
    for field, value in body.model_dump().items():
        setattr(row, field, value)
    db.commit()
    return data(row, "code", "description", "weight")


@router.delete("/outcomes/{key}")
def delete_outcome(key: str, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, LearningOutcome, key)
    course_access(db, row.course_id, user)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/courses/{course_id}/topics", status_code=201)
def create_topic(course_id: str, body: s.TopicIn, db: Session = Depends(get_db), user=Depends(editor)):
    course_access(db, course_id, user)
    if by_id(db, LearningOutcome, body.learning_outcome_id).course_id != course_id:
        fail(422, "CROSS_COURSE", "Chuẩn đầu ra không thuộc môn học")
    row = Topic(course_id=course_id, **body.model_dump())
    db.add(row)
    db.commit()
    return data(row, "name", "learning_outcome_id", "description")


@router.put("/topics/{key}")
def update_topic(key: str, body: s.TopicIn, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, Topic, key)
    course_access(db, row.course_id, user)
    if body.learning_outcome_id != row.learning_outcome_id:
        fail(409, "IMMUTABLE_MAPPING", "Tạo chủ đề mới nếu cần thay chuẩn đầu ra để bảo toàn RAG")
    row.name, row.description = body.name, body.description
    db.commit()
    return data(row, "name", "learning_outcome_id", "description")


@router.delete("/topics/{key}")
def delete_topic(key: str, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, Topic, key)
    course_access(db, row.course_id, user)
    if any(
        any(b["topic_id"] == key for b in e.blueprint)
        for e in db.scalars(select(Exam).where(Exam.course_id == row.course_id))
    ):
        fail(409, "IN_USE", "Chủ đề đang được sử dụng trong bài thi")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/courses/{course_id}/documents", status_code=201)
async def upload_document(
    course_id: str,
    topic_id: str = Form(),
    file: UploadFile = File(),
    db: Session = Depends(get_db),
    user=Depends(editor),
):
    course_access(db, course_id, user)
    if by_id(db, Topic, topic_id).course_id != course_id:
        fail(422, "CROSS_COURSE", "Chủ đề không thuộc môn học")
    filename = Path(file.filename or "").name[:250]
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in {"pdf", "pptx", "docx", "txt"}:
        fail(422, "INVALID_FORMAT", "Chỉ nhận PDF, PPTX, DOCX, TXT")
    content = await file.read(settings().max_document_mb * 1024 * 1024 + 1)
    if not content or len(content) > settings().max_document_mb * 1024 * 1024:
        fail(413, "DOCUMENT_SIZE", "Tài liệu rỗng hoặc quá lớn")
    key = f"documents/{uid()}/{filename}"
    storage.put(key, content)
    row = Document(
        course_id=course_id,
        topic_id=topic_id,
        filename=filename,
        storage_key=key,
        embedding_model=ai.embedding_name(),
    )
    db.add(row)
    db.add(Audit(user_id=user.id, event="DOCUMENT_UPLOADED", details={"course_id": course_id}))
    db.commit()
    return data(row, "filename", "status")


@router.post("/documents/{key}/retry")
def retry_document(key: str, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, Document, key, lock=True)
    course_access(db, row.course_id, user)
    if row.status != "FAILED":
        fail(409, "INVALID_STATE", "Chỉ xử lý lại tài liệu lỗi")
    row.status, row.error, row.embedding_model = "PENDING", None, ai.embedding_name()
    db.commit()
    return {"status": row.status}


@router.get("/courses/{course_id}/rag")
def rag_debug(course_id: str, topic_id: str, q: str, db: Session = Depends(get_db), user=Depends(staff)):
    course_access(db, course_id, user)
    if not q.strip() or len(q) > 3000:
        fail(422, "INVALID_QUERY", "Truy vấn phải từ 1–3000 ký tự")
    return ai.retrieve(db, course_id, topic_id, q)


@router.post("/courses/{course_id}/rubrics", status_code=201)
def create_rubric(course_id: str, body: s.RubricIn, db: Session = Depends(get_db), user=Depends(editor)):
    course_access(db, course_id, user)
    row = Rubric(course_id=course_id, **body.model_dump())
    db.add(row)
    db.commit()
    return data(row, "name", "criteria", "version")


@router.put("/rubrics/{key}")
def update_rubric(key: str, body: s.RubricIn, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, Rubric, key, lock=True)
    course_access(db, row.course_id, user)
    row.name, row.criteria, row.version = body.name, body.model_dump()["criteria"], row.version + 1
    db.commit()
    return data(row, "name", "criteria", "version")


@router.delete("/rubrics/{key}")
def delete_rubric(key: str, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, Rubric, key)
    course_access(db, row.course_id, user)
    db.delete(row)
    db.commit()
    return {"ok": True}


def validate_exam(db, body, user):
    course = course_access(db, body.course_id, user)
    if course.status != "ACTIVE":
        fail(409, "ARCHIVED", "Môn học đã lưu trữ")
    if by_id(db, Rubric, body.rubric_id).course_id != body.course_id:
        fail(422, "CROSS_COURSE", "Rubric không thuộc môn học")
    for row in body.blueprint:
        if by_id(db, Topic, row.topic_id).course_id != body.course_id:
            fail(422, "CROSS_COURSE", "Blueprint chứa chủ đề không thuộc môn học")


@router.post("/exams", status_code=201)
def create_exam(body: s.ExamIn, db: Session = Depends(get_db), user=Depends(editor)):
    validate_exam(db, body, user)
    row = Exam(**body.model_dump())
    db.add(row)
    db.commit()
    return data(row, "name", "status")


@router.put("/exams/{key}")
def update_exam(key: str, body: s.ExamIn, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, Exam, key, lock=True)
    course_access(db, row.course_id, user)
    if row.status != "DRAFT":
        fail(409, "PUBLISHED", "Không sửa đề đã công bố")
    validate_exam(db, body, user)
    for field, value in body.model_dump().items():
        setattr(row, field, value)
    db.commit()
    return data(row, "name", "status")


@router.delete("/exams/{key}")
def delete_exam(key: str, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, Exam, key, lock=True)
    course_access(db, row.course_id, user)
    if row.status != "DRAFT":
        fail(409, "PUBLISHED", "Không xóa đề đã công bố")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/exams/{key}/publish")
def publish(key: str, db: Session = Depends(get_db), user=Depends(editor)):
    exam = by_id(db, Exam, key, lock=True)
    course_access(db, exam.course_id, user)
    if exam.status == "PUBLISHED":
        return {"status": exam.status}
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
    for row in exam.blueprint:
        topic = by_id(db, Topic, row["topic_id"])
        chunks = ai.retrieve(db, exam.course_id, topic.id, topic.name, [d.id for d in docs])
        if not chunks:
            fail(409, "NO_EVIDENCE", f"Chủ đề {topic.name} chưa có tài liệu READY")
        for _ in range(row["count"]):
            question = ai.generate_question(topic, row["difficulty"], chunks, [q["text"] for q in questions])
            questions.append(
                question
                | {
                    "topic_id": topic.id,
                    "learning_outcome_id": topic.learning_outcome_id,
                    "difficulty": row["difficulty"],
                }
            )
    doc_ids = sorted(d.id for d in docs)
    exam.snapshot = {
        "exam_version": 1,
        "rubric_id": rubric.id,
        "rubric_version": rubric.version,
        "criteria": rubric.criteria,
        "document_ids": doc_ids,
        "questions": questions,
        "knowledge_version": hashlib.sha256(",".join(doc_ids).encode()).hexdigest(),
        "ai_provider": settings().ai_provider,
        "llm_model": settings().llm_model,
        "embedding_model": ai.embedding_name(),
        "prompt_version": ai.PROMPT_VERSION,
        "published_at": time.time(),
    }
    exam.status = "PUBLISHED"
    db.add(Audit(user_id=user.id, event="EXAM_PUBLISHED", details={"exam_id": exam.id}))
    db.commit()
    return {"status": exam.status, "question_count": len(questions)}


@router.post("/exams/{key}/assign")
def assign(key: str, body: s.AssignIn, db: Session = Depends(get_db), user=Depends(editor)):
    exam = by_id(db, Exam, key, lock=True)
    course_access(db, exam.course_id, user)
    if exam.status != "PUBLISHED":
        fail(409, "NOT_PUBLISHED", "Công bố đề trước khi giao bài")
    for student_id in set(body.student_ids):
        target = by_id(db, User, student_id)
        if target.role != "STUDENT" or target.status != "ACTIVE":
            fail(422, "NOT_STUDENT", "Chỉ giao bài cho sinh viên đang hoạt động")
        if not db.scalar(
            select(Assignment).where(Assignment.exam_id == key, Assignment.student_id == student_id)
        ):
            db.add(Assignment(exam_id=key, student_id=student_id))
    db.commit()
    return {"ok": True}


@router.get("/results")
def results(db: Session = Depends(get_db), user=Depends(staff)):
    query = (
        select(ExamSession, Exam, User)
        .join(Exam, Exam.id == ExamSession.exam_id)
        .join(User, User.id == ExamSession.student_id)
    )
    if user.role == "TEACHER":
        query = query.join(Course).where(Course.owner_id == user.id)
    return [
        data(session, "status", "started_at", "completed_at", "final_score")
        | {"exam_name": exam.name, "student_name": student.name}
        for session, exam, student in db.execute(query.order_by(ExamSession.created_at.desc()))
    ]


@router.get("/results/{key}")
def review(key: str, db: Session = Depends(get_db), user=Depends(staff)):
    session = by_id(db, ExamSession, key)
    exam = by_id(db, Exam, session.exam_id)
    course_access(db, exam.course_id, user)
    attempts = db.scalars(select(Attempt).where(Attempt.session_id == key).order_by(Attempt.sequence)).all()
    return data(session, "status", "final_score") | {
        "exam_name": exam.name,
        "snapshot": exam.snapshot,
        "student_name": by_id(db, User, session.student_id).name,
        "attempts": [
            data(a, "sequence", "question", "transcript", "stt_confidence", "assessment", "status")
            | {
                "evidence": [
                    data(e, "kind", "status", "sha256", "size")
                    for e in db.scalars(
                        select(Upload).where(Upload.attempt_id == a.id, Upload.status == "COMPLETED")
                    )
                ]
            }
            for a in attempts
        ],
    }
