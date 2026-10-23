"""Staff user profiles with class history and per-person exam sittings."""
import time

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .academic import class_data
from .db import get_db
from .models import Assignment, ClassStudent, Course, CourseEnrollment, Exam, ExamSession, TeachingClass, User
from .permissions import has_role, teacher_scope
from .retakes import history_row
from .security import by_id, fail, public_user, staff

router = APIRouter(prefix="/admin/users")


def user_classes(db, person, actor):
    query = select(TeachingClass).where(or_(
        TeachingClass.teacher_id == person.id,
        TeachingClass.id.in_(select(ClassStudent.class_id).where(ClassStudent.student_id == person.id)),
        TeachingClass.id.in_(select(Exam.class_id).join(Assignment).where(Assignment.student_id == person.id)),
        TeachingClass.id.in_(select(Exam.class_id).join(ExamSession).where(ExamSession.student_id == person.id, ExamSession.deleted_at.is_(None))),
    ))
    if teacher_scope(actor) and actor.id != person.id:
        query = query.where(TeachingClass.teacher_id == actor.id)
    return db.scalars(query.order_by(TeachingClass.starts_at.desc(), TeachingClass.code)).all()


def scoped_person(db, key, actor):
    person = by_id(db, User, key)
    classes = user_classes(db, person, actor)
    if teacher_scope(actor) and person.id != actor.id and not classes:
        legacy = db.scalar(select(Course.id).where(Course.owner_id == actor.id, or_(
            Course.id.in_(select(CourseEnrollment.course_id).where(CourseEnrollment.student_id == key)),
            Course.id.in_(select(Exam.course_id).join(Assignment).where(Assignment.student_id == key, Exam.class_id.is_(None))),
            Course.id.in_(select(Exam.course_id).join(ExamSession).where(ExamSession.student_id == key, Exam.class_id.is_(None), ExamSession.deleted_at.is_(None))),
        )))
        if not legacy or not has_role(person, "STUDENT"):
            fail(403, "FORBIDDEN", "Bạn không phụ trách người dùng này")
    return person, classes


def class_view(db, row, person, now):
    member = db.scalar(select(ClassStudent).where(ClassStudent.class_id == row.id, ClassStudent.student_id == person.id))
    return class_data(db, row) | {
        "phase": "COMPLETED" if row.ends_at <= now else "UPCOMING" if row.starts_at > now else "ONGOING",
        "membership": "TEACHER" if row.teacher_id == person.id else "ENROLLED" if member else "HISTORY",
        "student_number": member.student_number if member else None,
    }


@router.get("/{key}/profile")
def profile(key: str, db: Session = Depends(get_db), actor=Depends(staff)):
    person, classes = scoped_person(db, key, actor)
    now = time.time()
    return {"user": public_user(person) | {"created_at": person.created_at}, "server_time": now,
            "classes": [class_view(db, row, person, now) for row in classes]}


@router.get("/{key}/classes/{class_id}")
def user_class(key: str, class_id: str, db: Session = Depends(get_db), actor=Depends(staff)):
    person, classes = scoped_person(db, key, actor)
    row = next((c for c in classes if c.id == class_id), None)
    if not row:
        fail(404, "NOT_FOUND", "Lớp không thuộc hồ sơ hoặc phạm vi phụ trách")
    rounds = []
    for exam in db.scalars(select(Exam).where(Exam.class_id == class_id).order_by(Exam.created_at.desc())):
        assignment = db.scalar(select(Assignment).where(Assignment.exam_id == exam.id, Assignment.student_id == key))
        sessions = db.scalars(select(ExamSession).where(ExamSession.exam_id == exam.id, ExamSession.student_id == key,
                             ExamSession.deleted_at.is_(None)).order_by(ExamSession.attempt_number.desc())).all()
        if row.teacher_id != person.id and not assignment and not sessions:
            continue
        rounds.append({"id": exam.id, "name": exam.name, "status": exam.status,
                       "opens_at": assignment.opens_at if assignment else None,
                       "closes_at": assignment.closes_at if assignment else None,
                       "student_number": assignment.student_number if assignment else None,
                       "sessions": [history_row(s) for s in sessions]})
    return {"user": public_user(person), "class": class_view(db, row, person, time.time()), "rounds": rounds}
