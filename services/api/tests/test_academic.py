import time

from sqlalchemy import select
from test_mvp import ok, prepare

from app.excel import HEADERS, workbook_bytes
from app.models import Assignment, Course, Exam, ExamSession, TeachingClass, User


def setup_class(env, code="SE101-01"):
    context = prepare(env, 1)
    clients, _ = env
    teacher_id = ok(clients["teacher"].get("/auth/me"))["id"]
    student_id = ok(clients["student"].get("/auth/me"))["id"]
    now = time.time()
    body = {"code": code, "name": "Lớp học phần 01", "course_id": context["course"]["id"],
            "teacher_id": teacher_id, "starts_at": now - 86400, "ends_at": now + 86400}
    row = ok(clients["reviewer"].post("/admin/classes", json=body), 201)
    ok(clients["reviewer"].post(f"/admin/classes/{row['id']}/students", json={"student_ids": [student_id]}))
    return context, row, body, student_id


def make_round(env, context, row, name="Giữa kỳ", future=False):
    now = time.time() + (3600 if future else -10)
    return ok(env[0]["reviewer"].post(f"/admin/classes/{row['id']}/rounds", json={
        "exam_id": context["exam"]["id"], "name": name, "opens_at": now, "closes_at": now + 7200,
    }), 201)["id"]


def test_department_permissions_membership_and_delete(env):
    clients, _ = env
    body = {"code": "CNTT", "name": "Công nghệ thông tin"}
    assert clients["teacher"].post("/admin/departments", json=body).status_code == 403
    assert clients["student"].get("/admin/departments").status_code == 403
    key = ok(clients["reviewer"].post("/admin/departments", json=body), 201)["id"]
    cid = ok(clients["admin"].post("/admin/courses", json={"code": "SE", "name": "Software"}), 201)["id"]
    ok(clients["reviewer"].put(f"/admin/courses/{cid}/department", json={"department_id": key}))
    assert ok(clients["admin"].get("/admin/courses"))[0]["department_id"] == key
    assert clients["reviewer"].delete(f"/admin/departments/{key}").status_code == 409
    assert clients["teacher"].put(f"/admin/courses/{cid}/department", json={"department_id": None}).status_code == 403
    ok(clients["reviewer"].put(f"/admin/departments/{key}", json={"code": "IT", "name": "Information Technology"}))
    ok(clients["reviewer"].put(f"/admin/courses/{cid}/department", json={"department_id": None}))
    ok(clients["reviewer"].delete(f"/admin/departments/{key}"))


def test_class_crud_and_teacher_scope(env):
    context, row, body, sid = setup_class(env)
    clients, factory = env
    key = row["id"]
    assert clients["teacher"].post("/admin/classes", json=body).status_code == 403
    assert clients["teacher"].put(f"/admin/classes/{key}", json=body).status_code == 403
    assert clients["teacher"].delete(f"/admin/classes/{key}").status_code == 403
    assert clients["teacher"].post(f"/admin/classes/{key}/students", json={"student_ids": [sid]}).status_code == 403
    assert len(ok(clients["teacher"].get("/admin/classes"))) == 1
    assert ok(clients["teacher"].get(f"/admin/classes/{key}"))["students"][0]["id"] == sid
    unassigned = ok(clients["admin"].post("/admin/classes", json=body | {"code": "02", "teacher_id": None}), 201)
    assert clients["teacher"].get(f"/admin/classes/{unassigned['id']}").status_code == 403
    assert clients["admin"].put(f"/admin/classes/{key}", json=body | {"ends_at": body["starts_at"]}).status_code == 422
    assert clients["admin"].put(f"/admin/classes/{key}", json=body | {"teacher_id": sid}).status_code == 422
    ok(clients["reviewer"].put(f"/admin/classes/{key}", json=body | {"name": "Updated"}))
    ok(clients["reviewer"].delete(f"/admin/classes/{key}/students/{sid}"))
    ok(clients["reviewer"].delete(f"/admin/classes/{key}"))
    with factory() as db:
        assert db.get(User, sid) is not None
        assert db.get(Course, context["course"]["id"]) is not None


def test_round_snapshots_rosters_schedules_and_results_are_isolated(env):
    context, row, body, sid = setup_class(env)
    clients, factory = env
    key = row["id"]
    first = make_round(env, context, row)
    second = make_round(env, context, row, "Cuối kỳ", future=True)
    assert clients["student"].post("/exam-sessions", json={"exam_id": second}).status_code == 409
    assert clients["outsider"].post("/exam-sessions", json={"exam_id": first}).status_code == 403
    session = ok(clients["student"].post("/exam-sessions", json={"exam_id": first}))
    assert ok(clients["teacher"].get(f"/admin/results/{session['id']}"))["exam_id"] == first
    ok(clients["reviewer"].delete(f"/admin/classes/{key}/students/{sid}"))
    with factory() as db:
        original = db.get(Exam, context["exam"]["id"])
        clone = db.get(Exam, first)
        assert clone.snapshot == original.snapshot
        original.snapshot = dict(original.snapshot, questions=[])
        db.commit()
        assert db.get(Exam, first).snapshot["questions"]
        assert db.scalar(select(Assignment.id).where(Assignment.exam_id == first, Assignment.student_id == sid))
    results = ok(clients["teacher"].get(f"/admin/classes/{key}/rounds/{first}/results"))
    assert results[0]["sessions"][0]["id"] == session["id"]
    assert ok(clients["teacher"].get(f"/admin/classes/{key}/rounds/{second}/results"))[0]["sessions"] == []
    assert clients["reviewer"].delete(f"/admin/classes/{key}").status_code == 409
    assert clients["reviewer"].put(f"/admin/classes/{key}", json=body | {"ends_at": time.time() + 100}).status_code == 422


def test_teacher_reassignment_revokes_results_and_grading_access(env):
    context, row, body, sid = setup_class(env)
    clients, factory = env
    exam_id = make_round(env, context, row)
    session_id = ok(clients["student"].post("/exam-sessions", json={"exam_id": exam_id}))["id"]
    with factory() as db:
        session = db.get(ExamSession, session_id)
        session.status = "REVIEW_REQUIRED"
        db.commit()
    grade = {"score": 8.5, "reason": "Đã kiểm tra câu trả lời và rubric."}
    ok(clients["teacher"].post(f"/admin/results/{session_id}/manual-grade", json=grade))
    assert ok(clients["teacher"].get(f"/admin/results/{session_id}"))["final_score"] == 8.5
    ok(clients["reviewer"].put(f"/admin/classes/{row['id']}", json=body | {"teacher_id": None}))
    # Even owning the course does not grant access to an unassigned class.
    with factory() as db:
        db.get(Course, context["course"]["id"]).owner_id = body["teacher_id"]
        db.commit()
    assert clients["teacher"].get(f"/admin/results/{session_id}").status_code == 403
    assert clients["teacher"].post(f"/admin/results/{session_id}/manual-grade", json=grade).status_code == 403
    assert session_id not in [s["id"] for s in ok(clients["teacher"].get("/admin/results"))]
    assert exam_id not in [e["id"] for e in ok(clients["teacher"].get(f"/admin/courses/{context['course']['id']}/results"))["exams"]]


def test_class_excel_imports_are_atomic_and_idempotent(env):
    _, row, body, _ = setup_class(env)
    clients, factory = env
    endpoint = f"/admin/classes/{row['id']}/import-students"
    data = [["001", "fresh@example.edu.vn", "New student", "test-password-123"], ["002", "teacher@example.edu.vn", "Not a student", ""]]
    with factory() as db:
        db.scalar(select(User).where(User.username == "teacher")).email = "teacher@example.edu.vn"
        db.commit()
    assert clients["reviewer"].post(endpoint, files={"file": ("students.xlsx", workbook_bytes(HEADERS, data))}).status_code == 422
    with factory() as db:
        assert db.scalar(select(User.id).where(User.email == "fresh@example.edu.vn")) is None
    for _ in range(2):
        ok(clients["reviewer"].post(endpoint, files={"file": ("students.xlsx", workbook_bytes(HEADERS, data[:1]))}))
    assert len(ok(clients["reviewer"].get(f"/admin/classes/{row['id']}"))["students"]) == 2
    raw = workbook_bytes(["class_code", "teacher_username"], [[body["code"], "teacher"], ["missing", "teacher"]])
    ok(clients["admin"].put(f"/admin/classes/{row['id']}", json=body | {"teacher_id": None}))
    assert clients["reviewer"].post("/admin/class-teachers/import", files={"file": ("teachers.xlsx", raw)}).status_code == 422
    with factory() as db:
        assert db.get(TeachingClass, row["id"]).teacher_id is None
    raw = workbook_bytes(["class_code", "teacher_username"], [[body["code"], "teacher"]])
    assert clients["teacher"].post("/admin/class-teachers/import", files={"file": ("teachers.xlsx", raw)}).status_code == 403
    ok(clients["reviewer"].post("/admin/class-teachers/import", files={"file": ("teachers.xlsx", raw)}))
    assert ok(clients["teacher"].get(f"/admin/classes/{row['id']}"))["teacher_id"] == body["teacher_id"]


def test_round_validation_bank_category_and_course_deletion(env):
    context, row, body, _ = setup_class(env)
    clients, factory = env
    source = context["exam"]["id"]
    key = row["id"]
    ok(clients["admin"].put(f"/admin/exams/{source}/category", json={"category": "Giữa kỳ"}))
    assert ok(clients["admin"].get(f"/admin/classes/{key}"))["bank"][0]["category"] == "Giữa kỳ"
    payload = {"exam_id": source, "name": "Test", "opens_at": body["starts_at"] - 1, "closes_at": body["ends_at"]}
    assert clients["reviewer"].post(f"/admin/classes/{key}/rounds", json=payload).status_code == 422
    assert clients["teacher"].post(f"/admin/classes/{key}/rounds", json=payload).status_code == 403
    other = ok(clients["admin"].post("/admin/courses", json={"code": "OTHER", "name": "Other"}), 201)
    other_class = ok(clients["reviewer"].post("/admin/classes", json=body | {"code": "OTHER", "course_id": other["id"]}), 201)
    assert clients["reviewer"].post(f"/admin/classes/{other_class['id']}/rounds", json=payload | {"opens_at": time.time()}).status_code == 422
    exam_id = make_round(env, context, row)
    assert clients["admin"].put(f"/admin/exams/{exam_id}/category", json={"category": "Changed"}).status_code == 409
    assert clients["teacher"].get(f"/admin/classes/{key}/rounds/{source}/results").status_code == 404
    assert clients["admin"].delete(f"/admin/courses/{other['id']}").status_code == 409
    response = clients["admin"].request("DELETE", f"/admin/courses/{context['course']['id']}", json={"confirm_code": "SE101"})
    ok(response)
    with factory() as db:
        assert db.get(TeachingClass, key) is None
        assert db.get(Exam, exam_id) is None
        assert db.get(TeachingClass, other_class["id"]) is not None


def test_bank_approval_requires_review_and_does_not_enroll_students(env):
    context, row, _, sid = setup_class(env)
    clients, factory = env
    source = ok(clients["admin"].post("/admin/exams", json=context["payload"] | {"name": "Reusable bank exam"}), 201)["id"]
    assert clients["reviewer"].post(f"/admin/exams/{source}/bank-approve").status_code == 409
    ok(clients["admin"].post(f"/admin/exams/{source}/generate"))
    assert clients["reviewer"].post(f"/admin/exams/{source}/bank-approve").status_code == 409
    ok(clients["admin"].post(f"/admin/exams/{source}/teacher-approve"))
    assert clients["teacher"].post(f"/admin/exams/{source}/bank-approve").status_code == 403
    ok(clients["reviewer"].post(f"/admin/exams/{source}/bank-approve"))
    ok(clients["admin"].post(f"/admin/courses/{context['course']['id']}/students", json={"student_ids": [sid]}))
    assert source not in [e["id"] for e in ok(clients["student"].get("/exams/available"))]
    assert clients["student"].post("/exam-sessions", json={"exam_id": source}).status_code == 403
    context["exam"]["id"] = source
    round_id = make_round(env, context, row)
    assert round_id in [e["id"] for e in ok(clients["student"].get("/exams/available"))]
    with factory() as db:
        assert db.get(Exam, round_id).snapshot["office_approved_by"] == ok(clients["reviewer"].get("/auth/me"))["id"]


def test_removing_legacy_course_enrollment_preserves_class_round_roster(env):
    context, row, _, sid = setup_class(env)
    clients, factory = env
    exam_id = make_round(env, context, row)
    ok(clients["reviewer"].delete(f"/admin/users/{sid}/courses/{context['course']['id']}"))
    with factory() as db:
        assert db.scalar(select(Assignment.id).where(Assignment.exam_id == exam_id, Assignment.student_id == sid))
    assert exam_id in [e["id"] for e in ok(clients["student"].get("/exams/available"))]
