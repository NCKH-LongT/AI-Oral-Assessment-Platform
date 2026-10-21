"""Academic organization and class-scoped exam administration."""
import secrets
import time
from copy import deepcopy

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from pydantic import Field, model_validator
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .db import get_db
from .excel import parse_roster, template_bytes, workbook_bytes
from .excel_imports import parse
from .models import (
    Assignment,
    Audit,
    ClassStudent,
    Course,
    Department,
    Exam,
    ExamSession,
    Rubric,
    TeachingClass,
    User,
    uid,
)
from .permissions import has_role, role_filter, teacher_scope
from .retakes import history_row
from .schemas import Input
from .security import by_id, course_access, exam_officer, fail, hasher, staff

router = APIRouter(prefix="/admin")
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
TEACHER_SPEC = (["class_code", "teacher_username"], [["SE101-01", "gv001"]])


class NamedIn(Input):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)


class DepartmentIn(Input):
    department_id: str | None = None


class ClassIn(NamedIn):
    course_id: str
    teacher_id: str | None = None
    starts_at: float = Field(gt=0, allow_inf_nan=False)
    ends_at: float = Field(gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def ordered(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Ngày kết thúc phải sau ngày bắt đầu")
        return self


class RoundIn(Input):
    exam_id: str
    name: str = Field(min_length=1, max_length=200)
    opens_at: float = Field(gt=0, allow_inf_nan=False)
    closes_at: float = Field(gt=0, allow_inf_nan=False)


class StudentsIn(Input):
    student_ids: list[str] = Field(min_length=1, max_length=5000)


class CategoryIn(Input):
    category: str = Field(max_length=100)


def audit(db, user, event, **details):
    db.add(Audit(user_id=user.id, event=event, details=details))


def class_access(db, key, user, lock=False):
    row = by_id(db, TeachingClass, key, lock=lock)
    if not has_role(user, "ADMIN", "EXAM_OFFICER") and not (teacher_scope(user) and row.teacher_id == user.id):
        fail(403, "FORBIDDEN", "Bạn không được phân công lớp này")
    return row


def teacher(db, key):
    if key is None:
        return
    row = by_id(db, User, key)
    if not has_role(row, "TEACHER") or row.status != "ACTIVE":
        fail(422, "INVALID_TEACHER", "Chọn giảng viên đang hoạt động")


def class_data(db, row):
    return {k: getattr(row, k) for k in ("id", "code", "name", "course_id", "teacher_id", "starts_at", "ends_at")} | {
        "course_name": by_id(db, Course, row.course_id).name,
        "teacher_name": by_id(db, User, row.teacher_id).name if row.teacher_id else None,
        "student_count": db.scalar(select(func.count()).select_from(ClassStudent).where(ClassStudent.class_id == row.id)),
    }


@router.get("/departments")
def departments(db: Session = Depends(get_db), user=Depends(staff)):
    return [{"id": d.id, "code": d.code, "name": d.name} for d in db.scalars(select(Department).order_by(Department.code))]


@router.post("/departments", status_code=201)
def create_department(body: NamedIn, db: Session = Depends(get_db), user=Depends(exam_officer)):
    row = Department(**body.model_dump())
    db.add(row)
    db.flush()
    audit(db, user, "DEPARTMENT_CREATED", department_id=row.id)
    db.commit()
    return {"id": row.id}


@router.put("/departments/{key}")
def update_department(key: str, body: NamedIn, db: Session = Depends(get_db), user=Depends(exam_officer)):
    row = by_id(db, Department, key, lock=True)
    row.code, row.name = body.code, body.name
    audit(db, user, "DEPARTMENT_UPDATED", department_id=key)
    db.commit()
    return {"ok": True}


@router.delete("/departments/{key}")
def delete_department(key: str, db: Session = Depends(get_db), user=Depends(exam_officer)):
    row = by_id(db, Department, key, lock=True)
    if db.scalar(select(Course.id).where(Course.department_id == key)):
        fail(409, "DEPARTMENT_IN_USE", "Chuyển môn học sang bộ môn khác trước khi xóa")
    db.delete(row)
    audit(db, user, "DEPARTMENT_DELETED", department_id=key)
    db.commit()
    return {"ok": True}


@router.put("/courses/{key}/department")
def set_department(key: str, body: DepartmentIn, db: Session = Depends(get_db), user=Depends(exam_officer)):
    row = by_id(db, Course, key, lock=True)
    if body.department_id:
        by_id(db, Department, body.department_id)
    row.department_id = body.department_id
    audit(db, user, "COURSE_DEPARTMENT_CHANGED", course_id=key, department_id=body.department_id)
    db.commit()
    return {"ok": True}


@router.get("/classes")
def classes(db: Session = Depends(get_db), user=Depends(staff)):
    query = select(TeachingClass).order_by(TeachingClass.created_at.desc())
    if teacher_scope(user):
        query = query.where(TeachingClass.teacher_id == user.id)
    return [class_data(db, c) for c in db.scalars(query)]


@router.post("/classes", status_code=201)
def create_class(body: ClassIn, db: Session = Depends(get_db), user=Depends(exam_officer)):
    if by_id(db, Course, body.course_id).status != "ACTIVE":
        fail(409, "ARCHIVED", "Môn học đã lưu trữ")
    teacher(db, body.teacher_id)
    row = TeachingClass(**body.model_dump())
    db.add(row)
    db.flush()
    audit(db, user, "CLASS_CREATED", class_id=row.id, teacher_id=row.teacher_id)
    db.commit()
    return class_data(db, row)


@router.put("/classes/{key}")
def update_class(key: str, body: ClassIn, db: Session = Depends(get_db), user=Depends(exam_officer)):
    row = class_access(db, key, user, lock=True)
    teacher(db, body.teacher_id)
    by_id(db, Course, body.course_id)
    rounds = list(db.scalars(select(Exam.id).where(Exam.class_id == key)))
    if body.course_id != row.course_id and (rounds or db.scalar(select(ClassStudent.id).where(ClassStudent.class_id == key))):
        fail(409, "CLASS_IN_USE", "Không đổi môn khi lớp đã có sinh viên hoặc đợt thi")
    schedules = db.scalars(select(Assignment).where(Assignment.exam_id.in_(rounds))).all()
    if any(a.opens_at is None or a.closes_at is None or a.opens_at < body.starts_at or a.closes_at > body.ends_at for a in schedules):
        fail(422, "CLASS_SCHEDULE", "Thời gian lớp phải bao trùm các đợt thi đã tạo")
    before = row.teacher_id
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    audit(db, user, "CLASS_UPDATED", class_id=key, previous_teacher_id=before, teacher_id=row.teacher_id)
    db.commit()
    return class_data(db, row)


@router.delete("/classes/{key}")
def delete_class(key: str, db: Session = Depends(get_db), user=Depends(exam_officer)):
    row = class_access(db, key, user, lock=True)
    if db.scalar(select(Exam.id).where(Exam.class_id == key)):
        fail(409, "CLASS_IN_USE", "Lớp đã có đợt thi. Giữ lớp để bảo toàn lịch sử và điểm.")
    db.execute(delete(ClassStudent).where(ClassStudent.class_id == key))
    db.delete(row)
    audit(db, user, "CLASS_DELETED", class_id=key)
    db.commit()
    return {"ok": True}


@router.get("/class-teachers/template.xlsx")
def teacher_template(user=Depends(exam_officer)):
    return Response(workbook_bytes(*TEACHER_SPEC), media_type=XLSX,
                    headers={"Content-Disposition": 'attachment; filename="class-teachers.xlsx"'})


@router.post("/class-teachers/import")
def import_teachers(file: UploadFile = File(), db: Session = Depends(get_db), user=Depends(exam_officer)):
    rows = parse(file, "class-teachers", TEACHER_SPEC[0])
    seen = set()
    for line, data in rows:
        row = db.scalar(select(TeachingClass).where(TeachingClass.code == data["class_code"]).with_for_update())
        assigned = db.scalar(select(User).where(User.username == data["teacher_username"]))
        if not row or not assigned or row.id in seen:
            fail(422, "IMPORT_ROW", f"Dòng {line}: kiểm tra mã lớp, tên đăng nhập giáo viên và lớp trùng")
        teacher(db, assigned.id)
        seen.add(row.id)
        audit(db, user, "CLASS_TEACHER_IMPORTED", class_id=row.id, previous_teacher_id=row.teacher_id, teacher_id=assigned.id)
        row.teacher_id = assigned.id
    db.commit()
    return {"rows": len(rows)}


@router.get("/class-students/template.xlsx")
def student_template(user=Depends(exam_officer)):
    return Response(template_bytes(), media_type=XLSX, headers={"Content-Disposition": 'attachment; filename="class-students.xlsx"'})


def add_member(db, key, learner, number=None):
    if not has_role(learner, "STUDENT") or learner.status != "ACTIVE":
        fail(422, "INVALID_STUDENT", "Chọn sinh viên đang hoạt động")
    member = db.scalar(select(ClassStudent).where(ClassStudent.class_id == key, ClassStudent.student_id == learner.id))
    if number:
        duplicate = db.scalar(select(ClassStudent.id).where(ClassStudent.class_id == key, ClassStudent.student_number == number, ClassStudent.student_id != learner.id))
        if duplicate or (member and member.student_number and member.student_number != number):
            fail(422, "STUDENT_NUMBER_CONFLICT", "MSSV không khớp danh sách lớp")
    if not member:
        db.add(ClassStudent(class_id=key, student_id=learner.id, student_number=number))
    elif number:
        member.student_number = number


@router.post("/classes/{key}/students")
def add_students(key: str, body: StudentsIn, db: Session = Depends(get_db), user=Depends(exam_officer)):
    class_access(db, key, user, lock=True)
    for sid in set(body.student_ids):
        add_member(db, key, by_id(db, User, sid))
    audit(db, user, "CLASS_STUDENTS_ADDED", class_id=key, count=len(set(body.student_ids)))
    db.commit()
    return {"ok": True}


@router.post("/classes/{key}/import-students")
def import_students(key: str, file: UploadFile = File(), db: Session = Depends(get_db), user=Depends(exam_officer)):
    class_access(db, key, user, lock=True)
    raw = file.file.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        fail(413, "EXCEL_SIZE", "File Excel tối đa 2 MB")
    if not (file.filename or "").lower().endswith(".xlsx"):
        fail(422, "EXCEL_TYPE", "Chọn file .xlsx")
    rows = parse_roster(raw)
    for data in rows:
        matches = db.scalars(select(User).where(func.lower(User.email) == data["email"])).all()
        if len(matches) > 1:
            fail(422, "EMAIL_CONFLICT", "Email trùng nhiều tài khoản")
        learner = matches[0] if matches else None
        if not learner:
            learner = User(username=f"sv-{uid()}", email=data["email"], name=data["name"], role="STUDENT", password_hash=hasher.hash(data["password"] or secrets.token_urlsafe(32)))
            db.add(learner)
            db.flush()
        add_member(db, key, learner, data["student_number"])
    audit(db, user, "CLASS_STUDENTS_IMPORTED", class_id=key, count=len(rows))
    db.commit()
    return {"rows": len(rows)}


@router.delete("/classes/{key}/students/{sid}")
def remove_student(key: str, sid: str, db: Session = Depends(get_db), user=Depends(exam_officer)):
    class_access(db, key, user, lock=True)
    # Existing rounds keep their frozen roster and historical results.
    db.execute(delete(ClassStudent).where(ClassStudent.class_id == key, ClassStudent.student_id == sid))
    audit(db, user, "CLASS_STUDENT_REMOVED", class_id=key, student_id=sid)
    db.commit()
    return {"ok": True}


@router.get("/classes/{key}")
def class_detail(key: str, db: Session = Depends(get_db), user=Depends(staff)):
    row = class_access(db, key, user)
    students = [{"id": u.id, "name": u.name, "email": u.email, "student_number": m.student_number}
                for m, u in db.execute(select(ClassStudent, User).join(User).where(ClassStudent.class_id == key).order_by(User.name))]
    rounds = []
    for exam in db.scalars(select(Exam).where(Exam.class_id == key).order_by(Exam.created_at.desc())):
        schedule = db.scalar(select(Assignment).where(Assignment.exam_id == exam.id))
        rounds.append({"id": exam.id, "name": exam.name, "category": exam.category,
                       "opens_at": schedule.opens_at if schedule else None, "closes_at": schedule.closes_at if schedule else None})
    bank = [{"id": e.id, "name": e.name, "category": e.category, "rubric_name": r.name}
            for e, r in db.execute(select(Exam, Rubric).join(Rubric).where(Exam.course_id == row.course_id, Exam.class_id.is_(None), Exam.status == "PUBLISHED"))]
    return class_data(db, row) | {"students": students, "rounds": rounds, "bank": bank}


@router.post("/classes/{key}/rounds", status_code=201)
def create_round(key: str, body: RoundIn, db: Session = Depends(get_db), user=Depends(exam_officer)):
    row = class_access(db, key, user, lock=True)
    if not row.starts_at <= body.opens_at < body.closes_at <= row.ends_at:
        fail(422, "ROUND_SCHEDULE", "Lịch thi phải nằm trong thời gian lớp và giờ kết thúc phải sau giờ bắt đầu")
    source = by_id(db, Exam, body.exam_id, lock=True)
    if source.course_id != row.course_id or source.class_id or source.status != "PUBLISHED" or not (source.snapshot or {}).get("questions"):
        fail(422, "INVALID_BANK_EXAM", "Chọn đề đã công bố trong ngân hàng của môn học")
    if by_id(db, Course, row.course_id).status != "ACTIVE" or (source.snapshot or {}).get("practice"):
        fail(409, "INVALID_COURSE", "Môn học hoặc đề không dùng cho kỳ thi chính thức")
    if body.closes_at - body.opens_at < source.time_limit or body.closes_at <= time.time():
        fail(422, "SCHEDULE_LENGTH", "Khoảng thi phải đủ thời lượng bài và chưa kết thúc")
    members = db.scalars(select(ClassStudent).join(User, User.id == ClassStudent.student_id).where(ClassStudent.class_id == key, User.status == "ACTIVE", role_filter("STUDENT"))).all()
    if not members:
        fail(422, "EMPTY_CLASS", "Thêm sinh viên vào lớp trước khi tạo đợt thi")
    exam = Exam(course_id=row.course_id, class_id=key, source_exam_id=source.id, category=source.category,
                rubric_id=source.rubric_id, name=body.name, time_limit=source.time_limit, blueprint=deepcopy(source.blueprint),
                imported_questions=deepcopy(source.imported_questions), snapshot=deepcopy(source.snapshot),
                max_attempts=source.max_attempts, workflow=True, status="PUBLISHED")
    db.add(exam)
    db.flush()
    for m in members:
        db.add(Assignment(exam_id=exam.id, student_id=m.student_id, student_number=m.student_number, opens_at=body.opens_at, closes_at=body.closes_at))
    audit(db, user, "CLASS_ROUND_CREATED", class_id=key, exam_id=exam.id, source_exam_id=source.id, candidates=len(members))
    db.commit()
    return {"id": exam.id}


@router.get("/classes/{key}/rounds/{exam_id}/results")
def round_results(key: str, exam_id: str, db: Session = Depends(get_db), user=Depends(staff)):
    class_access(db, key, user)
    exam = by_id(db, Exam, exam_id)
    if exam.class_id != key:
        fail(404, "NOT_FOUND", "Đợt thi không thuộc lớp này")
    rows = []
    for assignment, learner in db.execute(select(Assignment, User).join(User).where(Assignment.exam_id == exam_id).order_by(User.name)):
        sessions = db.scalars(select(ExamSession).where(ExamSession.exam_id == exam_id, ExamSession.student_id == learner.id, ExamSession.deleted_at.is_(None)).order_by(ExamSession.attempt_number.desc())).all()
        rows.append({"student_id": learner.id, "student_name": learner.name, "student_number": assignment.student_number, "sessions": [history_row(s) for s in sessions]})
    return rows


@router.put("/exams/{key}/category")
def set_category(key: str, body: CategoryIn, db: Session = Depends(get_db), user=Depends(staff)):
    exam = by_id(db, Exam, key, lock=True)
    course_access(db, exam.course_id, user)
    if exam.class_id:
        fail(409, "ROUND_IMMUTABLE", "Phân loại đề nguồn trong ngân hàng")
    exam.category = body.category
    audit(db, user, "EXAM_CATEGORY_CHANGED", exam_id=key, category=body.category)
    db.commit()
    return {"ok": True}


@router.post("/exams/{key}/bank-approve")
def approve_bank_exam(key: str, db: Session = Depends(get_db), user=Depends(exam_officer)):
    exam = by_id(db, Exam, key, lock=True)
    if exam.class_id or exam.status != "TEACHER_APPROVED" or not (exam.snapshot or {}).get("questions"):
        fail(409, "APPROVAL_REQUIRED", "Giảng viên phải duyệt bản nháp trước khi công bố vào ngân hàng")
    if by_id(db, Course, exam.course_id).status != "ACTIVE":
        fail(409, "ARCHIVED", "Môn học đã lưu trữ")
    if db.scalar(select(Assignment.id).where(Assignment.exam_id == key)) or db.scalar(select(ExamSession.id).where(ExamSession.exam_id == key)):
        fail(409, "EXAM_IN_USE", "Đề đã có danh sách thi; tiếp tục duyệt trong Điều phối kỳ thi")
    exam.snapshot = exam.snapshot | {"office_approved_by": user.id, "published_at": time.time()}
    # No assignments: the source is never exposed to students via course enrollment.
    exam.status, exam.workflow = "PUBLISHED", True
    audit(db, user, "BANK_EXAM_APPROVED", exam_id=key)
    db.commit()
    return {"status": exam.status}
