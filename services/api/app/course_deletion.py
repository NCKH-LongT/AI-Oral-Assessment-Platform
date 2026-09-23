"""Delete a course transactionally; the worker retries object cleanup after commit."""

from sqlalchemy import delete, select
from sqlalchemy.exc import OperationalError

from .models import (
    Assignment,
    Attempt,
    Audit,
    BookSection,
    Chunk,
    Course,
    CourseEnrollment,
    Document,
    Exam,
    ExamSession,
    LearningOutcome,
    MediaCleanup,
    ReviewJob,
    Rubric,
    Topic,
    TopicDocument,
    TopicOutcome,
    TopicSection,
    Upload,
)
from .security import fail


def delete_course_tree(db, course_id, confirm_code, user):
    def locked(model, predicate):
        return db.scalars(select(model).where(predicate).with_for_update(nowait=True)).all()

    try:
        courses = locked(Course, Course.id == course_id)
        if not courses:
            fail(404, "NOT_FOUND", "Môn học không tồn tại")
        course = courses[0]
        if confirm_code != course.code:
            fail(422, "CONFIRMATION_MISMATCH", "Nhập đúng mã môn học để xác nhận xóa toàn bộ dữ liệu")
        # Parent locks block new FK children. NOWAIT avoids deadlocks with workers
        # that lock children first and lets the administrator retry safely.
        exams = locked(Exam, Exam.course_id == course_id)
        exam_ids = [row.id for row in exams]
        documents = locked(Document, Document.course_id == course_id)
        topics = locked(Topic, Topic.course_id == course_id)
        topic_ids = [row.id for row in topics]
        sessions = locked(ExamSession, ExamSession.exam_id.in_(exam_ids))
        session_ids = [row.id for row in sessions]
        attempts = locked(Attempt, Attempt.session_id.in_(session_ids))
        attempt_ids = [row.id for row in attempts]
        locked(ReviewJob, ReviewJob.attempt_id.in_(attempt_ids))
        uploads = locked(Upload, Upload.attempt_id.in_(attempt_ids))
    except OperationalError as exc:
        if getattr(exc.orig, "sqlstate", None) != "55P03":
            raise
        db.rollback()
        fail(409, "COURSE_BUSY", "Môn học đang được xử lý. Đợi hoàn tất rồi xóa lại.")

    for upload in uploads:
        db.add(MediaCleanup(upload_id=upload.id, storage_key=upload.storage_key))
    for document in documents:
        # Documents have UUIDs too. No upload staging directory exists for them;
        # the existing cleanup queue can safely delete their stored objects.
        db.add(MediaCleanup(upload_id=document.id, storage_key=document.storage_key))

    for model, predicate in (
        (ReviewJob, ReviewJob.attempt_id.in_(attempt_ids)),
        (Upload, Upload.attempt_id.in_(attempt_ids)),
        (Attempt, Attempt.session_id.in_(session_ids)),
        (ExamSession, ExamSession.exam_id.in_(exam_ids)),
        (Assignment, Assignment.exam_id.in_(exam_ids)),
        (Exam, Exam.course_id == course_id),
        (TopicDocument, TopicDocument.topic_id.in_(topic_ids)),
        (TopicSection, TopicSection.topic_id.in_(topic_ids)),
        (TopicOutcome, TopicOutcome.topic_id.in_(topic_ids)),
        (Chunk, Chunk.course_id == course_id),
        (BookSection, BookSection.course_id == course_id),
        (Document, Document.course_id == course_id),
        (Topic, Topic.course_id == course_id),
        (LearningOutcome, LearningOutcome.course_id == course_id),
        (Rubric, Rubric.course_id == course_id),
        (CourseEnrollment, CourseEnrollment.course_id == course_id),
    ):
        db.execute(delete(model).where(predicate))
    db.add(Audit(user_id=user.id, event="COURSE_DELETED", details={
        "course_id": course_id, "code": course.code, "name": course.name,
        "exam_count": len(exams), "session_count": len(sessions),
        "document_count": len(documents), "media_count": len(uploads),
    }))
    db.delete(course)
    db.commit()
    return {"ok": True}
