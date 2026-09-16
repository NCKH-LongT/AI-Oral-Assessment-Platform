import hashlib
import time
from copy import deepcopy
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import ai, storage
from . import schemas as s
from .db import get_db
from .knowledge import chunk_scope, set_mappings, topic_data
from .models import (
    Assignment,
    Attempt,
    Audit,
    BookSection,
    Course,
    CourseEnrollment,
    Document,
    Exam,
    ExamSession,
    LearningOutcome,
    ReviewJob,
    Rubric,
    Topic,
    TopicDocument,
    Upload,
    User,
    uid,
)
from .runtime_settings import settings
from .security import admin, by_id, course_access, editor, fail, hasher, public_user, staff
from .speech import google_ready, policy

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
def delete_course(course_id: str, db: Session = Depends(get_db), user=Depends(editor)):
    row = course_access(db, course_id, user)
    for model in (LearningOutcome, Topic, Document, Rubric, Exam, CourseEnrollment):
        if db.scalar(select(model.id).where(model.course_id == course_id).limit(1)):
            fail(
                409,
                "COURSE_IN_USE",
                "Môn học còn dữ liệu. Xóa dữ liệu liên quan trước hoặc lưu trữ môn học để giữ lịch sử.",
            )
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/courses/{course_id}/archive")
def archive_course(course_id: str, db: Session = Depends(get_db), user=Depends(editor)):
    row = course_access(db, course_id, user)
    row.status = "ARCHIVED"
    db.commit()
    return {"status": "ARCHIVED"}


@router.post("/courses/{course_id}/restore")
def restore_course(course_id: str, db: Session = Depends(get_db), user=Depends(editor)):
    row = course_access(db, course_id, user)
    row.status = "ACTIVE"
    db.commit()
    return {"status": "ACTIVE"}


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
        "topics": [
            topic_data(db, t)
            for t in db.scalars(select(Topic).where(Topic.course_id == course_id).order_by(Topic.created_at))
        ],
        "documents": rows(
            Document,
            "filename",
            "status",
            "error",
            "topic_id",
            "version",
            "embedding_model",
            "kind",
            "page_count",
        ),
        "chapters": rows(BookSection, "document_id", "title", "level", "start_page", "end_page", "source"),
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
    row = Topic(course_id=course_id, learning_outcome_id=body.learning_outcome_ids[0], name=body.name)
    db.add(row)
    set_mappings(db, row, body)
    db.commit()
    return topic_data(db, row)


@router.put("/topics/{key}")
def update_topic(key: str, body: s.TopicIn, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, Topic, key, lock=True)
    course_access(db, row.course_id, user)
    set_mappings(db, row, body)
    db.commit()
    return topic_data(db, row)


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
    topic_id: str | None = Form(default=None),
    kind: str = Form(default="SUPPLEMENT"),
    file: UploadFile = File(),
    db: Session = Depends(get_db),
    user=Depends(editor),
):
    course_access(db, course_id, user)
    if kind not in {"TEXTBOOK", "SUPPLEMENT"}:
        fail(422, "INVALID_KIND", "Loại tài liệu không hợp lệ")
    if topic_id and by_id(db, Topic, topic_id).course_id != course_id:
        fail(422, "CROSS_COURSE", "Chủ đề không thuộc môn học")
    filename = Path(file.filename or "").name[:250]
    ext = filename.rsplit(".", 1)[-1].lower()
    if kind == "TEXTBOOK":
        if ext != "pdf" or topic_id:
            fail(422, "TEXTBOOK_PDF", "Giáo trình là PDF dùng chung cho môn, không chọn chủ đề")
        if db.scalar(select(Document.id).where(Document.course_id == course_id, Document.kind == "TEXTBOOK")):
            fail(409, "TEXTBOOK_EXISTS", "Môn học đã có giáo trình PDF")
    if ext not in {"pdf", "pptx", "docx", "txt"}:
        fail(422, "INVALID_FORMAT", "Chỉ nhận PDF, PPTX, DOCX, TXT")
    limit = (settings().max_textbook_mb if kind == "TEXTBOOK" else settings().max_document_mb) * 1024 * 1024
    content = await file.read(limit + 1)
    if not content or len(content) > limit:
        fail(413, "DOCUMENT_SIZE", "Tài liệu rỗng hoặc quá lớn")
    key = f"documents/{uid()}/{filename}"
    storage.put(key, content)
    row = Document(
        course_id=course_id,
        topic_id=topic_id,
        kind=kind,
        filename=filename,
        storage_key=key,
        embedding_model=ai.embedding_name(),
    )
    db.add(row)
    db.flush()
    if topic_id:
        db.add(TopicDocument(topic_id=topic_id, document_id=row.id))
    db.add(Audit(user_id=user.id, event="DOCUMENT_UPLOADED", details={"course_id": course_id}))
    db.commit()
    return data(row, "filename", "status")


@router.get("/documents/{key}/content")
def document_content(key: str, db: Session = Depends(get_db), user=Depends(staff)):
    document = by_id(db, Document, key)
    course_access(db, document.course_id, user)
    return Response(
        storage.get(document.storage_key),
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename*=UTF-8''" + quote(document.filename, safe="")},
    )


@router.put("/documents/{key}/file")
async def replace_failed_textbook(
    key: str, file: UploadFile = File(), db: Session = Depends(get_db), user=Depends(editor)
):
    row = by_id(db, Document, key, lock=True)
    course_access(db, row.course_id, user)
    if row.kind != "TEXTBOOK" or row.status != "FAILED":
        fail(
            409,
            "INVALID_STATE",
            "Chỉ thay PDF giáo trình xử lý lỗi; giáo trình đã dùng phải được giữ để đối chiếu",
        )
    name = Path(file.filename or "").name[:250]
    limit = settings().max_textbook_mb * 1024 * 1024
    content = await file.read(limit + 1)
    if not name.lower().endswith(".pdf") or not content.startswith(b"%PDF-") or len(content) > limit:
        fail(422, "INVALID_PDF", "Cần file PDF hợp lệ trong giới hạn dung lượng giáo trình")
    storage_key = f"documents/{uid()}/{name}"
    storage.put(storage_key, content)
    row.storage_key, row.filename = storage_key, name
    row.status, row.error, row.version = "PENDING", None, row.version + 1
    db.add(
        Audit(
            user_id=user.id,
            event="FAILED_TEXTBOOK_REPLACED",
            details={"document_id": key, "version": row.version},
        )
    )
    db.commit()
    return data(row, "filename", "status", "version")


@router.post("/documents/{key}/chapters", status_code=201)
def add_section(key: str, body: s.SectionIn, db: Session = Depends(get_db), user=Depends(editor)):
    doc = by_id(db, Document, key)
    course_access(db, doc.course_id, user)
    if doc.kind != "TEXTBOOK" or doc.status != "READY" or body.end_page > (doc.page_count or 0):
        fail(422, "INVALID_PAGES", "Chọn số trang PDF hợp lệ của giáo trình đã xử lý")
    row = BookSection(course_id=doc.course_id, document_id=doc.id, **body.model_dump(), source="MANUAL")
    db.add(row)
    db.commit()
    return data(row, "title", "level", "start_page", "end_page", "source")


@router.put("/chapters/{key}")
def update_section(key: str, body: s.SectionIn, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, BookSection, key, lock=True)
    course_access(db, row.course_id, user)
    if body.end_page > (by_id(db, Document, row.document_id).page_count or 0):
        fail(422, "INVALID_PAGES", "Trang vượt số trang PDF")
    for field, value in body.model_dump().items():
        setattr(row, field, value)
    row.source = "MANUAL"
    db.commit()
    return data(row, "title", "level", "start_page", "end_page", "source")


@router.delete("/chapters/{key}")
def delete_section(key: str, db: Session = Depends(get_db), user=Depends(editor)):
    row = by_id(db, BookSection, key)
    course_access(db, row.course_id, user)
    db.delete(row)
    db.commit()
    return {"ok": True}


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
    row = by_id(db, Rubric, key, lock=True)
    course_access(db, row.course_id, user)
    if db.scalar(select(Exam.id).where(Exam.rubric_id == key).limit(1)):
        fail(
            409,
            "RUBRIC_IN_USE",
            "Rubric đang được đề thi sử dụng. Đổi rubric hoặc xóa đề nháp liên quan trước; đề đã công bố giữ nguyên lịch sử.",
        )
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
    if body.course_id != row.course_id:
        fail(422, "CROSS_COURSE", "Không chuyển đề thi sang môn học khác")
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


@router.post("/exams/{key}/copy", status_code=201)
def copy_exam(key: str, db: Session = Depends(get_db), user=Depends(editor)):
    source = by_id(db, Exam, key)
    body = s.ExamIn(
        course_id=source.course_id,
        rubric_id=source.rubric_id,
        name=f"{source.name[:189]} (bản sao)",
        time_limit=source.time_limit,
        blueprint=deepcopy(source.blueprint),
    )
    validate_exam(db, body, user)
    row = Exam(**body.model_dump())
    db.add(row)
    db.commit()
    return data(row, "name", "status", "blueprint", "time_limit", "rubric_id")


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
    exam.snapshot = {
        "exam_version": 2,
        "generation_prompt_version": "topic-los-v2",
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
                ],
                "reviews": [
                    data(
                        j,
                        "status",
                        "reason",
                        "policy",
                        "original",
                        "result",
                        "error",
                        "created_at",
                        "completed_at",
                        "requested_by",
                    )
                    for j in db.scalars(
                        select(ReviewJob)
                        .where(ReviewJob.attempt_id == a.id)
                        .order_by(ReviewJob.created_at.desc())
                    )
                ],
            }
            for a in attempts
        ],
    }


@router.post("/attempts/{key}/google-review", status_code=202)
def google_review(key: str, body: s.ReviewIn, db: Session = Depends(get_db), user=Depends(admin)):
    # Compatibility for existing clients and review history; new UI uses Gemini.
    return request_transcription_review(key, body, db, user, "google")


@router.post("/attempts/{key}/gemini-review", status_code=202)
def gemini_review(key: str, body: s.ReviewIn, db: Session = Depends(get_db), user=Depends(admin)):
    return request_transcription_review(key, body, db, user, "gemini")


def request_transcription_review(key, body, db, user, provider):
    attempt = by_id(db, Attempt, key, lock=True)
    session = by_id(db, ExamSession, attempt.session_id, lock=True)
    exam = by_id(db, Exam, session.exam_id)
    course_access(db, exam.course_id, user)
    if session.status not in {"SUBMITTED", "REVIEW_REQUIRED", "COMPLETED"} or attempt.status != "GRADED":
        fail(409, "NOT_FINISHED", "Chờ sinh viên nộp bài và hoàn tất chấm lần đầu")
    if provider == "gemini" and not settings().gemini_api_key:
        fail(422, "GEMINI_NOT_CONFIGURED", "Cấu hình GEMINI_API_KEY trên server để nhận dạng lại bằng Gemini")
    if provider == "google" and not google_ready():
        fail(
            422,
            "GOOGLE_NOT_CONFIGURED",
            "Upload JSON Google hợp lệ trong Cấu hình giọng nói trước khi nhận dạng lại",
        )
    existing = db.scalar(select(ReviewJob).where(ReviewJob.attempt_id == key, ReviewJob.status == "PENDING"))
    if existing:
        return data(existing, "status")
    audio = db.scalar(
        select(Upload).where(Upload.attempt_id == key, Upload.kind == "AUDIO", Upload.status == "COMPLETED")
    )
    if not audio:
        fail(409, "AUDIO_NOT_READY", "Chưa có audio gốc đã tải lên hoàn tất")
    previous = db.scalar(
        select(ReviewJob)
        .where(ReviewJob.attempt_id == key, ReviewJob.status == "COMPLETED")
        .order_by(ReviewJob.created_at.desc())
        .limit(1)
    )
    job = ReviewJob(
        attempt_id=key,
        requested_by=user.id,
        reason=body.reason,
        policy=policy(db)
        | {"provider": provider}
        | ({"model": settings().gemini_stt_model, "preprocessing": "off"} if provider == "gemini" else {}),
        original={
            "transcript": previous.result["transcript"] if previous else attempt.transcript,
            "stt_confidence": previous.result["stt_confidence"] if previous else attempt.stt_confidence,
            "submitted_transcript": attempt.transcript,
            "assessment": attempt.assessment,
            "audio_id": audio.id,
            "audio_sha256": audio.sha256,
        },
    )
    db.add(job)
    session.status, session.final_score = "REVIEW_REQUIRED", None
    db.flush()
    db.add(
        Audit(
            user_id=user.id,
            event=provider.upper() + "_REVIEW_REQUESTED",
            details={"job_id": job.id, "attempt_id": key, "reason": body.reason},
        )
    )
    db.commit()
    return data(job, "status")


@router.put("/users/{key}/role")
def change_role(key: str, body: s.RoleIn, db: Session = Depends(get_db), user=Depends(admin)):
    admins = db.scalars(
        select(User).where(User.role == "ADMIN", User.status == "ACTIVE").order_by(User.id).with_for_update()
    ).all()
    row = by_id(db, User, key, lock=True)
    if row.role == "ADMIN" and body.role != "ADMIN" and row.status == "ACTIVE" and len(admins) <= 1:
        fail(409, "LAST_ADMIN", "Cần giữ ít nhất một quản trị viên đang hoạt động")
    before = row.role
    row.role = body.role
    db.add(
        Audit(
            user_id=user.id,
            event="USER_ROLE_CHANGED",
            details={"user_id": row.id, "before": before, "after": body.role},
        )
    )
    db.commit()
    return public_user(row)


@router.get("/courses/{course_id}/students")
def course_students(course_id: str, db: Session = Depends(get_db), user=Depends(staff)):
    course_access(db, course_id, user)
    return list(
        db.scalars(select(CourseEnrollment.student_id).where(CourseEnrollment.course_id == course_id))
    )


@router.post("/courses/{course_id}/students")
def enroll_students(course_id: str, body: s.AssignIn, db: Session = Depends(get_db), user=Depends(admin)):
    course_access(db, course_id, user)
    by_id(db, Course, course_id, lock=True)
    for key in set(body.student_ids):
        learner = by_id(db, User, key)
        if learner.status != "ACTIVE":
            fail(422, "INACTIVE_USER", "Tài khoản không hoạt động")
        if not db.scalar(
            select(CourseEnrollment.id).where(
                CourseEnrollment.course_id == course_id, CourseEnrollment.student_id == key
            )
        ):
            db.add(CourseEnrollment(course_id=course_id, student_id=key))
    db.add(
        Audit(
            user_id=user.id,
            event="COURSE_ENROLLED",
            details={"course_id": course_id, "user_ids": body.student_ids},
        )
    )
    db.commit()
    return {"ok": True}


@router.delete("/courses/{course_id}/students/{student_id}")
def unenroll_student(course_id: str, student_id: str, db: Session = Depends(get_db), user=Depends(admin)):
    course_access(db, course_id, user)
    row = db.scalar(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course_id, CourseEnrollment.student_id == student_id
        )
    )
    if row:
        db.delete(row)
    db.add(
        Audit(
            user_id=user.id,
            event="COURSE_UNENROLLED",
            details={"course_id": course_id, "user_id": student_id},
        )
    )
    db.commit()
    return {"ok": True}
