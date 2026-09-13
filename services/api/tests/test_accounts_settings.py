import json
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import select
from test_mvp import ok, prepare

from app import google_login, runtime_settings, worker
from app.models import Exam, OAuthFlow, User
from app.practice import COURSE_ID, EXAM_ID, ensure_practice


@pytest.fixture
def platform_file(monkeypatch, tmp_path):
    path = tmp_path / "secrets/platform.json"
    monkeypatch.setattr(runtime_settings, "managed_path", lambda: path)
    return path


def config_body(**extra):
    return {
        "ai_provider": "demo",
        "llm_model": "gemini-2.5-flash",
        "embedding_model": "gemini-embedding-001",
        "stt_model": "base",
        "google_login_enabled": True,
        "google_client_id": "test.apps.googleusercontent.com",
        "google_client_secret": "test-client-secret",
        "public_origin": "http://localhost:3000",
        **extra,
    }


def test_runtime_credentials_permissions_redaction_and_live_updates(env, platform_file):
    clients, _ = env
    admin = clients["admin"]
    body = config_body(gemini_api_key="private-gemini-test")
    for role in ("student", "teacher", "reviewer"):
        assert clients[role].get("/admin/settings/platform").status_code == 403
        assert clients[role].put("/admin/settings/platform", json=body).status_code == 403
    result = ok(admin.put("/admin/settings/platform", json=body))
    assert result["gemini_key_configured"] and result["google_secret_configured"]
    assert "private-gemini-test" not in json.dumps(result) and "test-client-secret" not in json.dumps(result)
    assert platform_file.stat().st_mode & 0o777 == 0o600
    assert runtime_settings.settings().gemini_api_key == "private-gemini-test"
    body = config_body(google_client_secret=None, ai_provider="gemini")
    ok(admin.put("/admin/settings/platform", json=body))
    assert runtime_settings.settings().ai_provider == "gemini"
    assert runtime_settings.settings().google_client_secret == "test-client-secret"
    assert admin.put("/admin/settings/platform", json=body | {"clear_gemini_key": True}).status_code == 422
    assert runtime_settings.settings().gemini_api_key == "private-gemini-test"
    for origin in ("http://evil.example", "https://user:pass@example.com", "https://example.com/api"):
        assert admin.put("/admin/settings/platform", json=body | {"public_origin": origin}).status_code == 422
    ok(
        admin.put(
            "/admin/settings/platform",
            json=body | {"google_login_enabled": False, "clear_google_secret": True},
        )
    )
    assert not runtime_settings.settings().google_client_secret


def test_admin_grants_roles_immediately_and_protects_last_admin(env):
    clients, _ = env
    student_id = ok(clients["student"].get("/auth/me"))["id"]
    admin_id = ok(clients["admin"].get("/auth/me"))["id"]
    path = f"/admin/users/{student_id}/role"
    assert clients["teacher"].put(path, json={"role": "ADMIN"}).status_code == 403
    assert clients["admin"].put(f"/admin/users/{admin_id}/role", json={"role": "STUDENT"}).status_code == 409
    ok(clients["admin"].put(path, json={"role": "ADMIN"}))
    assert ok(clients["student"].get("/auth/me"))["role"] == "ADMIN"
    assert clients["student"].get("/admin/users").status_code == 200
    ok(clients["student"].put(f"/admin/users/{admin_id}/role", json={"role": "STUDENT"}))
    assert clients["admin"].get("/admin/users").status_code == 403


def test_course_membership_includes_future_exams_and_hides_drafts(env):
    context = prepare(env)
    clients, factory = env
    admin, student = clients["admin"], clients["outsider"]
    sid = ok(student.get("/auth/me"))["id"]
    base = f"/admin/courses/{context['course']['id']}/students"
    assert student.get(base).status_code == 403
    assert clients["teacher"].post(base, json={"student_ids": [sid]}).status_code == 403
    assert ok(student.get("/exams/available")) == []
    for _ in range(2):
        ok(admin.post(base, json={"student_ids": [sid]}))
    assert ok(admin.get(base)) == [sid]
    rows = ok(student.get("/exams/available"))
    assert rows[0]["course_id"] == context["course"]["id"]
    draft = ok(admin.post("/admin/exams", json=context["payload"] | {"name": "Future"}), 201)
    assert len(ok(student.get("/exams/available"))) == 1
    ok(admin.post(f"/admin/exams/{draft['id']}/publish"))
    assert len(ok(student.get("/exams/available"))) == 2
    session = ok(student.post("/exam-sessions", json={"exam_id": context["exam"]["id"]}))
    ok(admin.delete(base + "/" + sid))
    assert ok(student.get("/exams/available")) == []
    assert student.post("/exam-sessions", json={"exam_id": draft["id"]}).status_code == 403
    assert student.get(f"/exam-sessions/{session['id']}").status_code == 200
    with factory() as db:
        ensure_practice(db)
        ensure_practice(db)
    for role in ("student", "outsider", "admin", "teacher", "reviewer"):
        rows = ok(clients[role].get("/exams/available"))
        assert any(row["id"] == EXAM_ID and row["practice"] and row["course_id"] == COURSE_ID for row in rows)
        assert clients[role].post("/exam-sessions", json={"exam_id": EXAM_ID}).status_code == 200
    with factory() as db:
        assert len(db.scalars(select(Exam).where(Exam.id == EXAM_ID)).all()) == 1
        result = worker.grade_answer(db, db.get(Exam, EXAM_ID), None, None, "Thử trả lời", 1)
        assert result["score"] is None and "luyện tập" in result["reasoning_summary"]


def begin(client, desktop=False):
    flow = ok(client.post("/auth/google/desktop")) if desktop else None
    response = client.get(
        "/auth/google/start", params={"flow_id": flow["flow_id"]} if flow else {}, follow_redirects=False
    )
    assert response.status_code == 302
    query = parse_qs(urlsplit(response.headers["location"]).query)
    assert query["scope"] == ["openid email profile"] and query["code_challenge_method"] == ["S256"]
    return query["state"][0], flow


def test_google_login_creates_student_without_linking_existing_account(env, platform_file, monkeypatch):
    clients, factory = env
    admin, browser = clients["admin"], clients["outsider"]
    ok(admin.put("/admin/settings/platform", json=config_body()))
    state, _ = begin(browser)
    monkeypatch.setattr(
        google_login,
        "verify_identity",
        lambda *args: {"sub": "google-sub-one", "email": "admin", "name": "Google student"},
    )
    assert (
        browser.get(
            "/auth/google/callback", params={"state": state, "code": "test"}, follow_redirects=False
        ).status_code
        == 400
    )
    response = browser.get(
        "/auth/google/callback",
        params={"state": state, "code": "test"},
        headers={"Cookie": "google_oauth_state=" + state},
        follow_redirects=False,
    )
    assert response.status_code == 303
    user = ok(browser.get("/auth/me"))
    assert user["role"] == "STUDENT" and user["email"] == "admin"
    with factory() as db:
        assert db.scalar(select(User).where(User.username == "admin")).role == "ADMIN"
    assert (
        browser.get(
            "/auth/google/callback",
            params={"state": state, "code": "test"},
            headers={"Cookie": "google_oauth_state=" + state},
            follow_redirects=False,
        ).status_code
        == 400
    )
    second, _ = begin(browser)
    browser.get(
        "/auth/google/callback",
        params={"state": second, "code": "test"},
        headers={"Cookie": "google_oauth_state=" + second},
        follow_redirects=False,
    )
    assert ok(browser.get("/auth/me"))["id"] == user["id"]


def test_desktop_google_poll_is_bound_one_time_and_handles_failure(env, platform_file, monkeypatch):
    clients, factory = env
    ok(clients["admin"].put("/admin/settings/platform", json=config_body()))
    browser, desktop = clients["outsider"], clients["student"]
    state, flow = begin(desktop, desktop=True)
    body = {"flow_id": flow["flow_id"], "poll_token": flow["poll_token"]}
    assert ok(desktop.post("/auth/google/poll", json=body))["pending"]
    assert browser.post("/auth/google/poll", json=body | {"poll_token": "x" * 64}).status_code == 400
    with factory() as db:
        row = db.get(OAuthFlow, flow["flow_id"])
        row.consumed = True
        db.commit()
    # Callback exchanging the token is still pending, not a failure.
    assert ok(desktop.post("/auth/google/poll", json=body))["pending"]
    with factory() as db:
        db.get(OAuthFlow, flow["flow_id"]).consumed = False
        db.commit()
    monkeypatch.setattr(
        google_login, "verify_identity", lambda *args: {"sub": "desktop-sub", "email": "desktop@gmail.com"}
    )
    result = browser.get(
        "/auth/google/callback",
        params={"state": state, "code": "code"},
        headers={"Cookie": "google_oauth_state=" + state},
        follow_redirects=False,
    )
    assert result.status_code == 200 and "access_token" not in result.headers.get("set-cookie", "")
    assert ok(desktop.post("/auth/google/poll", json=body))["user"]["email"] == "desktop@gmail.com"
    assert desktop.post("/auth/google/poll", json=body).status_code == 400
    state, flow = begin(desktop, desktop=True)
    browser.get(
        "/auth/google/callback",
        params={"state": state, "error": "access_denied"},
        headers={"Cookie": "google_oauth_state=" + state},
        follow_redirects=False,
    )
    assert (
        desktop.post(
            "/auth/google/poll", json={"flow_id": flow["flow_id"], "poll_token": flow["poll_token"]}
        ).status_code
        == 400
    )


def test_google_token_verification_checks_audience_nonce_and_verified_email(monkeypatch):
    from types import SimpleNamespace

    import httpx

    cfg = SimpleNamespace(
        google_client_id="test.apps.googleusercontent.com",
        google_client_secret="secret",
        public_origin="https://oral.example.edu",
    )
    flow = SimpleNamespace(nonce="expected-nonce", verifier="pkce-verifier")
    captured = {}

    def exchange(url, **kwargs):
        assert url == "https://oauth2.googleapis.com/token"
        assert kwargs["data"]["code_verifier"] == "pkce-verifier"
        return httpx.Response(200, json={"id_token": "signed-token"}, request=httpx.Request("POST", url))

    def verify(token, request, audience):
        captured["audience"] = audience
        return dict(claims)

    monkeypatch.setattr(google_login.httpx, "post", exchange)
    monkeypatch.setattr(google_login.id_token, "verify_oauth2_token", verify)
    claims = {"sub": "one", "email": "one@gmail.com", "email_verified": True, "nonce": "expected-nonce"}
    assert google_login.verify_identity("code", flow, cfg)["sub"] == "one"
    assert captured["audience"] == cfg.google_client_id
    for change in ({"nonce": "wrong"}, {"email_verified": False}, {"email_verified": "true"}, {"sub": ""}):
        original = dict(claims)
        claims.update(change)
        with pytest.raises(ValueError):
            google_login.verify_identity("code", flow, cfg)
        claims = original


def test_runtime_snapshot_is_consistent_until_operation_finishes(env, platform_file):
    clients, _ = env
    admin = clients["admin"]
    ok(admin.put("/admin/settings/platform", json=config_body()))
    with runtime_settings.snapshot():
        before = runtime_settings.settings().llm_model
        # Simulate another process atomically writing a new version.
        values = json.loads(platform_file.read_text())
        values["llm_model"] = "new-model"
        platform_file.write_text(json.dumps(values))
        assert runtime_settings.settings().llm_model == before
        assert runtime_settings.settings(fresh=True).llm_model == "new-model"
    assert runtime_settings.settings().llm_model == "new-model"
