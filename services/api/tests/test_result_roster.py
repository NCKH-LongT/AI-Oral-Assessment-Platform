from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from test_mvp import ok, prepare
from app.models import Assignment, CourseEnrollment, Exam, ExamSession, User


def test_roster_includes_absent_students_latest_score_and_day_attempt_filters(env):
    context = prepare(env, 1)
    clients, factory = env
    admin = clients["admin"]
    with factory() as db:
        student = db.scalar(select(User).where(User.username == "student"))
        absent = db.scalar(select(User).where(User.username == "outsider"))
        db.add(CourseEnrollment(course_id=context["course"]["id"], student_id=absent.id))
        times = [datetime(2026, 10, d, 0, 15, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh")).timestamp() for d in (11, 12)]
        first = ExamSession(exam_id=context["exam"]["id"], student_id=student.id, attempt_number=1,
                            status="COMPLETED", final_score=7, started_at=times[0], created_at=times[0])
        second = ExamSession(exam_id=context["exam"]["id"], student_id=student.id, attempt_number=2,
                             status="COMPLETED", final_score=0, started_at=times[1], created_at=times[1])
        db.add_all([first, second]); db.commit()
        student_id, absent_id, first_id, second_id = student.id, absent.id, first.id, second.id
    path = f"/admin/courses/{context['course']['id']}/results"
    catalog = ok(admin.get(path))
    assert len(catalog["exams"]) == 1 and catalog["rows"] == []
    query = {"exam_id": context["exam"]["id"]}
    result = ok(admin.get(path, params=query))
    assert result["dates"] == ["2026-10-12", "2026-10-11"]
    assert result["attempt_numbers"] == [1, 2]
    rows = {r["student_id"]: r for r in result["rows"]}
    assert len(rows) == 2 and rows[absent_id]["status"] == "NOT_TAKEN" and rows[absent_id]["session"] is None
    assert rows[student_id]["session"]["id"] == second_id and rows[student_id]["final_score"] == 0
    filtered = ok(admin.get(path, params=query | {"exam_date": "2026-10-11"}))
    assert next(r for r in filtered["rows"] if r["student_id"] == student_id)["session"]["id"] == first_id
    filtered = ok(admin.get(path, params=query | {"attempt_number": 1}))
    assert next(r for r in filtered["rows"] if r["student_id"] == student_id)["final_score"] == 7
    assert clients["student"].get(path).status_code == 403
    assert clients["teacher"].get(path).status_code == 403
    assert admin.get(path, params={"exam_id": "different-exam"}).status_code == 404
    assert admin.get(path, params=query | {"exam_date": "invalid"}).status_code == 422


def test_workflow_roster_respects_schedule_and_deleted_sittings(env):
    context = prepare(env, 1)
    clients, factory = env
    with factory() as db:
        exam = db.get(Exam, context["exam"]["id"])
        exam.workflow = True
        student = db.scalar(select(User).where(User.username == "student"))
        absent = db.scalar(select(User).where(User.username == "outsider"))
        assignment = db.scalar(select(Assignment).where(Assignment.exam_id == exam.id))
        begins = datetime(2026, 10, 12, 8, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh")).timestamp()
        assignment.opens_at, assignment.closes_at = begins, begins + 3600
        db.add(CourseEnrollment(course_id=exam.course_id, student_id=absent.id))
        db.add(ExamSession(exam_id=exam.id, student_id=student.id, attempt_number=1,
                          status="DELETED", deleted_at=begins + 120, created_at=begins))
        db.commit()
    path = f"/admin/courses/{context['course']['id']}/results"
    query = {"exam_id": context["exam"]["id"]}
    result = ok(clients["admin"].get(path, params=query | {"exam_date": "2026-10-12"}))
    assert len(result["rows"]) == 1 and result["rows"][0]["status"] == "NOT_TAKEN"
    assert result["rows"][0]["final_score"] is None
    assert not ok(clients["admin"].get(path, params=query | {"exam_date": "2026-10-13"}))["rows"]
