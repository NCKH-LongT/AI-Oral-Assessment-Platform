from copy import deepcopy

from test_mvp import ok, prepare

from app.models import Assignment, Exam


def test_course_update_delete_archive_restore_and_access(env):
    clients, _ = env
    teacher = clients["teacher"]
    course = ok(teacher.post("/admin/courses", json={"code": "CRUD", "name": "Original"}), 201)
    path = f"/admin/courses/{course['id']}"
    updated = {"code": "CRUD-EDIT", "name": "Edited", "description": "New description"}
    ok(teacher.put(path, json=updated))
    assert ok(teacher.get("/admin/courses"))[0]["name"] == "Edited"
    for role in ("student", "reviewer"):
        for suffix in ("/archive", "/restore"):
            assert clients[role].post(path + suffix).status_code == 403
        assert clients[role].delete(path).status_code == 403
        assert clients[role].put(path, json=updated).status_code == 403
    assert ok(teacher.post(path + "/archive"))["status"] == "ARCHIVED"
    assert ok(teacher.post(path + "/restore"))["status"] == "ACTIVE"
    ok(teacher.delete(path))
    assert ok(teacher.get("/admin/courses")) == []
    assert teacher.get(path + "/workspace").status_code == 404


def test_rubric_and_draft_crud_preserves_published_snapshot(env):
    context = prepare(env)
    clients, factory = env
    admin = clients["admin"]
    base = f"/admin/courses/{context['course']['id']}"
    published_path = f"/admin/exams/{context['exam']['id']}"
    with factory() as db:
        snapshot = deepcopy(db.get(Exam, context["exam"]["id"]).snapshot)
    rubric_body = {
        "name": "New rubric",
        "criteria": [
            {"name": "Understanding", "description": "Clear", "max_score": 10, "weight": 1},
        ],
    }
    rubric = ok(admin.post(base + "/rubrics", json=rubric_body), 201)
    rubric_path = f"/admin/rubrics/{rubric['id']}"
    rubric_body["name"] = "Updated rubric"
    assert ok(admin.put(rubric_path, json=rubric_body))["version"] == 2
    draft = ok(admin.post("/admin/exams", json=context["payload"] | {"rubric_id": rubric["id"]}), 201)
    draft_path = f"/admin/exams/{draft['id']}"
    updated = context["payload"] | {"name": "Updated exam", "rubric_id": rubric["id"], "time_limit": 600}
    ok(admin.put(draft_path, json=updated))
    workspace = ok(admin.get(base + "/workspace"))
    row = next(e for e in workspace["exams"] if e["id"] == draft["id"])
    assert row["name"] == "Updated exam" and row["time_limit"] == 600
    assert admin.delete(rubric_path).json()["error"]["code"] == "RUBRIC_IN_USE"
    assert admin.delete(base).json()["error"]["code"] == "COURSE_IN_USE"
    ok(admin.delete(draft_path))
    ok(admin.delete(rubric_path))
    assert admin.delete(rubric_path).status_code == 404
    assert admin.delete(published_path).status_code == 409
    assert admin.put(published_path, json=context["payload"]).status_code == 409
    copy = ok(admin.post(published_path + "/copy"), 201)
    assert copy["status"] == "DRAFT"
    assert copy["id"] != context["exam"]["id"]
    ok(admin.put(f"/admin/exams/{copy['id']}", json=context["payload"] | {"name": "Edited copy"}))
    with factory() as db:
        assert db.get(Exam, copy["id"]).snapshot is None
        assert db.query(Assignment).filter_by(exam_id=copy["id"]).count() == 0
        assert db.get(Exam, context["exam"]["id"]).snapshot == snapshot
    ok(admin.post(base + "/archive"))
    assert admin.post(published_path + "/copy").status_code == 409
    assert admin.post("/admin/exams", json=context["payload"]).status_code == 409
    ok(admin.post(base + "/restore"))
    ok(admin.post(published_path + "/copy"), 201)


def test_crud_rejects_other_teachers_and_cross_course_changes(env):
    context = prepare(env)
    clients, _ = env
    base = f"/admin/courses/{context['course']['id']}"
    rubric_path = f"/admin/rubrics/{context['rubric']['id']}"
    exam_path = f"/admin/exams/{context['exam']['id']}"
    other = clients["teacher"]
    assert other.delete(base).status_code == 403
    assert other.post(base + "/archive").status_code == 403
    assert other.post(base + "/restore").status_code == 403
    assert other.delete(rubric_path).status_code == 403
    assert other.delete(exam_path).status_code == 403
    assert other.post(exam_path + "/copy").status_code == 403
    assert other.put(exam_path, json=context["payload"]).status_code == 403
    assert clients["reviewer"].post(exam_path + "/copy").status_code == 403
    admin = clients["admin"]
    copy = ok(admin.post(exam_path + "/copy"), 201)
    course = ok(admin.post("/admin/courses", json={"code": "OTHER", "name": "Other course"}), 201)
    response = admin.put(f"/admin/exams/{copy['id']}", json=context["payload"] | {"course_id": course["id"]})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CROSS_COURSE"
