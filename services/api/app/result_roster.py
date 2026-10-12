"""Course/exam roster including students without a sitting; dates use Vietnam time."""
from collections import defaultdict
from datetime import date, datetime, time as daytime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
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
           db: Session = Depends(get_db), user=Depends(staff)):
    course = course_access(db, course_id, user)
    exams = db.scalars(select(Exam).where(Exam.course_id == course_id).order_by(Exam.created_at.desc())).all()
    result = {"course_id": course.id, "exams": [{"id": e.id, "name": e.name, "status": e.status} for e in exams],
              "dates": [], "rows": []}
    selected = [e for e in exams if not exam_id or e.id == exam_id]
    if exam_id and not selected:
        fail(404, "NOT_FOUND", "Đề thi không thuộc môn đã chọn")
    exam_ids = [e.id for e in selected]
    assignments = defaultdict(list)
    for assignment in db.scalars(select(Assignment).where(Assignment.exam_id.in_(exam_ids))):
        assignments[assignment.student_id].append(assignment)
    sessions = db.scalars(select(ExamSession).where(ExamSession.exam_id.in_(exam_ids),
        ExamSession.deleted_at.is_(None)).order_by(
            func.coalesce(ExamSession.started_at, ExamSession.created_at).desc(),
            ExamSession.created_at.desc(), ExamSession.attempt_number.desc(), ExamSession.id)).all()
    dates = {day(s.started_at or s.created_at) for s in sessions}
    dates.update(day(a.opens_at) for group in assignments.values() for a in group if a.opens_at)
    result["dates"] = sorted(dates, reverse=True)
    candidates = set(assignments) | {s.student_id for s in sessions}
    if not exam_id or any(not e.workflow for e in selected):
        candidates.update(db.scalars(select(CourseEnrollment.student_id).where(CourseEnrollment.course_id == course.id)))
    # Retain historical test takers even if their account/enrollment was subsequently disabled.
    students = db.scalars(select(User).where(User.id.in_(candidates), User.role == "STUDENT").order_by(User.name, User.id)).all()
    chosen = {}
    for sitting in sessions:
        if exam_date and day(sitting.started_at or sitting.created_at) != exam_date.isoformat():
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
        assigned = assignments.get(student.id, [])
        assignment = next((a for a in assigned if sitting and a.exam_id == sitting.exam_id), assigned[0] if assigned else None)
        # An absent student is only expected on days covered by their assigned schedule.
        if exam_date and not sitting and assigned and all(
            (a.opens_at is not None and a.opens_at >= end)
            or (a.closes_at is not None and a.closes_at <= begin) for a in assigned
        ):
            continue
        row = {"student_id": student.id, "student_name": student.name, "email": student.email,
               "student_number": assignment.student_number if assignment else None,
               "session": None, "processing": None, "status": "NOT_TAKEN", "final_score": None,
               "ai_score": None, "low_score": False, "exam_name": None}
        if sitting:
            row.update(exam_name=next(e.name for e in selected if e.id == sitting.exam_id), session=history_row(sitting), status=sitting.status, ai_score=sitting.ai_score,
                       low_score=sitting.ai_score is not None and sitting.ai_score < 5,
                       final_score=sitting.final_score if sitting.status == "COMPLETED" else None,
                       processing=summarize(jobs[sitting.id]))
        result["rows"].append(row)
    return result
