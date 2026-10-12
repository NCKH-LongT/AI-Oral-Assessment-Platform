"""Course/exam roster including students without a sitting; dates use Vietnam time."""
from collections import defaultdict
from datetime import date, datetime, time as daytime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Assignment, Attempt, CourseEnrollment, Exam, ExamSession, ProcessingJob, User
from .processing import summarize
from .retakes import history_row
from .security import course_access, fail, staff

router = APIRouter(prefix="/admin")
ZONE = ZoneInfo("Asia/Ho_Chi_Minh")


def day(timestamp):
    return datetime.fromtimestamp(timestamp, ZONE).date().isoformat()


@router.get("/courses/{course_id}/results")
def roster(course_id: str, exam_id: str | None = None, exam_date: date | None = None,
           attempt_number: int | None = Query(None, ge=1),
           db: Session = Depends(get_db), user=Depends(staff)):
    course = course_access(db, course_id, user)
    exams = db.scalars(select(Exam).where(Exam.course_id == course_id).order_by(Exam.created_at.desc())).all()
    result = {"course_id": course.id, "exams": [{"id": e.id, "name": e.name, "status": e.status} for e in exams],
              "dates": [], "attempt_numbers": [], "rows": []}
    if not exam_id:
        return result
    exam = next((e for e in exams if e.id == exam_id), None)
    if not exam:
        fail(404, "NOT_FOUND", "Đề thi không thuộc môn đã chọn")
    assignments = {a.student_id: a for a in db.scalars(select(Assignment).where(Assignment.exam_id == exam.id))}
    sessions = db.scalars(select(ExamSession).where(ExamSession.exam_id == exam.id,
        ExamSession.deleted_at.is_(None)).order_by(ExamSession.attempt_number.desc(), ExamSession.created_at.desc())).all()
    dates = {day(s.started_at or s.created_at) for s in sessions}
    dates.update(day(a.opens_at) for a in assignments.values() if a.opens_at)
    result["dates"] = sorted(dates, reverse=True)
    result["attempt_numbers"] = sorted({1} | {s.attempt_number for s in sessions})
    candidates = set(assignments) | {s.student_id for s in sessions}
    if not exam.workflow:
        candidates.update(db.scalars(select(CourseEnrollment.student_id).where(CourseEnrollment.course_id == course.id)))
    # Retain historical test takers even if their account/enrollment was subsequently disabled.
    students = db.scalars(select(User).where(User.id.in_(candidates), User.role == "STUDENT").order_by(User.name, User.id)).all()
    chosen = {}
    for sitting in sessions:
        if exam_date and day(sitting.started_at or sitting.created_at) != exam_date.isoformat():
            continue
        if attempt_number and sitting.attempt_number != attempt_number:
            continue
        chosen.setdefault(sitting.student_id, sitting)
    if exam_date:
        begin = datetime.combine(exam_date, daytime.min, ZONE).timestamp()
        end = datetime.combine(exam_date + timedelta(days=1), daytime.min, ZONE).timestamp()
    jobs = defaultdict(list)
    for job, sid in db.execute(select(ProcessingJob, Attempt.session_id).join(Attempt).where(
        Attempt.session_id.in_([s.id for s in chosen.values()]),
    )):
        jobs[sid].append(job)
    for student in students:
        sitting = chosen.get(student.id)
        assignment = assignments.get(student.id)
        # An absent student is only expected on days covered by their assigned schedule.
        if exam_date and not sitting and assignment and (
            (assignment.opens_at is not None and assignment.opens_at >= end)
            or (assignment.closes_at is not None and assignment.closes_at <= begin)
        ):
            continue
        row = {"student_id": student.id, "student_name": student.name, "email": student.email,
               "student_number": assignment.student_number if assignment else None,
               "session": None, "processing": None, "status": "NOT_TAKEN", "final_score": None,
               "ai_score": None, "low_score": False}
        if sitting:
            row.update(session=history_row(sitting), status=sitting.status, ai_score=sitting.ai_score,
                       low_score=sitting.ai_score is not None and sitting.ai_score < 5,
                       final_score=sitting.final_score if sitting.status == "COMPLETED" else None,
                       processing=summarize(jobs[sitting.id]))
        result["rows"].append(row)
    return result
