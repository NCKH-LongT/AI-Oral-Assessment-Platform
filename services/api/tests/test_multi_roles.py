import time

from test_mvp import ok


def test_union_permissions_and_immediate_revocation(env):
    clients, _ = env
    admin, teacher = clients["admin"], clients["teacher"]
    tid = ok(teacher.get("/auth/me"))["id"]
    course = ok(admin.post("/admin/courses", json={"code": "OTHER", "name": "Other owner's course"}), 201)
    path = f"/admin/courses/{course['id']}/outcomes"
    assert teacher.post(path, json={"code": "L1", "description": "Goal"}).status_code == 403
    assert teacher.get("/admin/examination/teachers").status_code == 403
    roles = ok(admin.put(f"/admin/users/{tid}/roles", json={"roles": ["TEACHER", "EXAM_OFFICER"]}))
    assert roles["roles"] == ["EXAM_OFFICER", "TEACHER"]
    assert roles["role"] == "EXAM_OFFICER"
    # The original login immediately receives the union, including course scope.
    assert teacher.get("/admin/examination/teachers").status_code == 200
    assert course["id"] in [c["id"] for c in ok(teacher.get("/admin/courses"))]
    ok(teacher.post(path, json={"code": "L1", "description": "Goal"}), 201)
    assert teacher.put(f"/admin/users/{tid}/roles", json={"roles": ["ADMIN"]}).status_code == 403
    # Legacy single-role endpoint deliberately replaces the full set.
    ok(admin.put(f"/admin/users/{tid}/role", json={"role": "TEACHER"}))
    assert ok(teacher.get("/auth/me"))["roles"] == ["TEACHER"]
    assert teacher.get("/admin/examination/teachers").status_code == 403
    assert teacher.post(path, json={"code": "L2", "description": "Goal"}).status_code == 403


def test_student_teacher_web_desktop_membership_and_profile_union(env):
    clients, _ = env
    admin, student = clients["admin"], clients["student"]
    sid = ok(student.get("/auth/me"))["id"]
    ok(admin.put(f"/admin/users/{sid}/roles", json={"roles": ["STUDENT", "TEACHER"]}))
    student.headers.pop("X-Oral-Client")
    assert student.get("/auth/me").status_code == 200
    teachers = ok(admin.get("/admin/examination/teachers"))
    assert sid in [t["id"] for t in teachers]
    course = ok(student.post("/admin/courses", json={"code": "MIX", "name": "Mixed roles"}), 201)
    now = time.time()
    base = {"name": "Mixed class", "course_id": course["id"], "teacher_id": sid,
            "starts_at": now - 100, "ends_at": now + 100}
    taught = ok(admin.post("/admin/classes", json=base | {"code": "TEACH"}), 201)
    attended = ok(admin.post("/admin/classes", json=base | {"code": "LEARN", "teacher_id": None}), 201)
    ok(admin.post(f"/admin/classes/{attended['id']}/students", json={"student_ids": [sid]}))
    profile = ok(admin.get(f"/admin/users/{sid}/profile"))
    assert {c["id"] for c in profile["classes"]} == {taught["id"], attended["id"]}
    assert {c["membership"] for c in profile["classes"]} == {"TEACHER", "ENROLLED"}
    assert len(ok(student.get(f"/admin/users/{sid}/profile"))["classes"]) == 2
    ok(admin.put(f"/admin/users/{sid}/roles", json={"roles": ["STUDENT"]}))
    assert student.get("/auth/me").status_code == 403
    student.headers["X-Oral-Client"] = "desktop"
    assert student.get("/auth/me").status_code == 200
    assert student.get("/admin/courses").status_code == 403


def test_admin_inherits_all_roles_and_last_admin_is_protected(env):
    clients, _ = env
    admin = clients["admin"]
    aid = ok(admin.get("/auth/me"))["id"]
    assert ok(admin.get("/auth/me"))["roles"] == ["ADMIN"]
    assert aid in [t["id"] for t in ok(admin.get("/admin/examination/teachers"))]
    assert admin.put(f"/admin/users/{aid}/roles", json={"roles": ["TEACHER", "EXAM_OFFICER"]}).status_code == 409
    assert admin.put(f"/admin/users/{aid}/roles", json={"roles": []}).status_code == 422
    assert admin.put(f"/admin/users/{aid}/roles", json={"roles": ["UNKNOWN"]}).status_code == 422
    extra = ok(admin.post("/admin/users", json={"username": "mixed-admin", "name": "Extra admin",
        "password": "test-password-456", "roles": ["ADMIN", "STUDENT"]}), 201)
    assert extra["roles"] == ["ADMIN", "STUDENT"]
    ok(admin.put(f"/admin/users/{extra['id']}/roles", json={"roles": ["TEACHER", "STUDENT"]}))
    assert admin.put(f"/admin/users/{aid}/roles", json={"roles": ["STUDENT"]}).status_code == 409


def test_concurrent_admin_demotions_keep_one_admin(env):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    import pytest
    from fastapi.testclient import TestClient
    from sqlalchemy import func, select

    from app.main import app
    from app.models import User
    from app.permissions import role_filter

    clients, factory = env
    if factory.kw["bind"].dialect.name != "postgresql":
        pytest.skip("Row locking requires PostgreSQL")
    first = clients["admin"]
    first_id = ok(first.get("/auth/me"))["id"]
    extra = ok(first.post("/admin/users", json={"username": "second-admin", "name": "Second",
        "password": "test-password-456", "roles": ["ADMIN", "TEACHER"]}), 201)
    with TestClient(app) as second:
        ok(second.post("/auth/login", json={"username": "second-admin", "password": "test-password-456"}))
        barrier = Barrier(2)

        def demote(client, uid):
            barrier.wait(timeout=10)
            return client.put(f"/admin/users/{uid}/roles", json={"roles": ["TEACHER"]}).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            a = pool.submit(demote, first, first_id)
            b = pool.submit(demote, second, extra["id"])
            assert sorted([a.result(timeout=20), b.result(timeout=20)]) == [200, 409]
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(User).where(role_filter("ADMIN"))) == 1
