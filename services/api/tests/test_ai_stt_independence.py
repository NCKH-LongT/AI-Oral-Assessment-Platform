import json

import pytest
from test_accounts_settings import config_body
from test_mvp import ok, prepare, start, upload

from app import ai, google_credentials, runtime_settings, speech, stt, worker
from app.config import Settings, settings
from app.models import SystemSetting


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch, tmp_path):
    monkeypatch.setattr(runtime_settings, "managed_path", lambda: tmp_path / "platform.json")
    monkeypatch.setattr(google_credentials, "managed_path", lambda: tmp_path / "google-stt.json")
    monkeypatch.setattr(settings(), "google_stt_credentials_file", "")


@pytest.mark.parametrize("provider", ["local", "local_server"])
def test_enable_gemini_preserves_whisper_policy_and_grades_text(env, monkeypatch, provider):
    clients, _ = env
    admin, student = clients["admin"], clients["student"]
    policy = {"provider": provider, "preprocessing": "off", "language": "vi"}
    ok(admin.put("/admin/settings/speech", json=policy))
    ok(
        admin.put(
            "/admin/settings/platform",
            json=config_body(
                ai_provider="gemini",
                gemini_api_key="test-gemini-key",
                google_login_enabled=False,
            ),
        )
    )
    assert ok(student.get("/stt/config")) == policy
    assert not ok(admin.get("/admin/settings/speech"))["google_configured"]

    transcript = "Dependency injection provides dependencies externally and improves testing."
    grading_inputs = []

    def gemini(operation, model, payload):
        if operation == "embedContent":
            return {"embedding": {"values": [1.0] + [0.0] * 767}}
        data = json.loads(payload["contents"][0]["parts"][0]["text"])
        references = [c["id"] for c in data["evidence"]]
        if "rubric" in data:
            grading_inputs.append(data)
            output = {
                "confidence": 0.99,
                "criteria": [
                    {"name": c["name"], "score": c["max_score"] * 0.8, "comment": "Correct"}
                    for c in data["rubric"]
                ],
                "missing_concepts": [],
                "reasoning_summary": "Grounded answer",
                "reference_chunk_ids": references,
            }
        else:
            schema = payload["generationConfig"]["responseJsonSchema"]
            assert "english_terms" in schema["required"]
            output = {
                "text": "Explain dependency injection.",
                "expected_concepts": ["DI"],
                "reference_chunk_ids": references,
                "english_terms": [{"term": "dependency injection", "meaning": "tiêm phụ thuộc"}],
            }
        return {"candidates": [{"content": {"parts": [{"text": json.dumps(output)}]}}]}

    def forbidden_google(*args, **kwargs):
        pytest.fail("Whisper and Gemini grading must not call Google STT or load its JSON")

    monkeypatch.setattr(ai, "gemini", gemini)
    monkeypatch.setattr(speech, "google_transcribe", forbidden_google)
    monkeypatch.setattr(google_credentials, "load", forbidden_google)
    context = prepare(env, 1)
    workspace = ok(admin.get(f"/admin/courses/{context['course']['id']}/workspace"))
    assert workspace["exams"][0]["questions"][0]["english_terms"] == [
        {"term": "dependency injection", "meaning": "tiêm phụ thuộc"},
    ]
    session = start(env, context)
    aid = session["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    text = {"transcript": transcript, "stt_confidence": 0.99}
    if provider == "local_server":
        # Exercise the real STT dispatcher; stub audio/model computation only.
        monkeypatch.setattr(speech, "prepare_audio", lambda *a: {})
        monkeypatch.setattr(speech, "whisper", lambda *a: text)
        recognized = ok(student.post("/stt", files={"file": ("answer.webm", b"audio")}))
        assert recognized["provider"] == "local_server"
        text = {key: recognized[key] for key in text}
    else:
        # Desktop produces this text locally and must not upload audio to /stt.
        assert (
            student.post("/stt", files={"file": ("answer.webm", b"audio")}).json()["error"]["code"]
            == "DESKTOP_REQUIRED"
        )
    ok(
        student.post(
            f"/question-attempts/{aid}/submit", json=text, headers={"Idempotency-Key": "whisper-submit"}
        )
    )
    upload(student, aid, "AUDIO")
    upload(student, aid, "VIDEO")
    pending = ok(student.post(f"/exam-sessions/{session['id']}/finish"))
    assert pending["status"] == "SUBMITTED" and pending["final_score"] is None
    monkeypatch.setattr(speech, "transcribe_file", forbidden_google)
    assert worker.tick()
    result = ok(student.get(f"/exam-sessions/{session['id']}"))
    assert result["status"] == "COMPLETED" and result["final_score"] == 8
    assert len(grading_inputs) == 1 and grading_inputs[0]["transcript"] == transcript


@pytest.mark.parametrize("provider", ["local", "local_server", "google"])
def test_stt_environment_default_and_saved_policy_precedence(env, monkeypatch, provider):
    # Construct the real environment config, including Gemini with no STT JSON.
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("STT_PROVIDER", provider)
    cfg = Settings(_env_file=None)
    monkeypatch.setattr(speech, "settings", lambda: cfg)
    student = env[0]["student"]
    assert ok(student.get("/stt/config"))["provider"] == provider
    with env[1]() as db:
        db.add(
            SystemSetting(key="speech", value={"provider": "local", "language": "en", "preprocessing": "off"})
        )
        db.commit()
    assert ok(student.get("/stt/config")) == {"provider": "local", "language": "en", "preprocessing": "off"}


def test_whisper_failure_does_not_request_google_credentials(env, monkeypatch):
    def broken(*args):
        raise RuntimeError("Model failed")

    monkeypatch.setattr(stt, "transcribe_file", broken)
    response = env[0]["student"].post("/stt", files={"file": ("answer.webm", b"audio")})
    assert response.status_code == 503
    message = response.json()["error"]["message"]
    assert "Whisper" in message and "Google" not in message and "JSON" not in message


def test_google_credentials_required_only_for_explicit_google_policy(env):
    clients, factory = env
    with factory() as db:
        db.add(SystemSetting(key="speech", value={"provider": "google"}))
        db.commit()
    response = clients["student"].post("/stt", files={"file": ("answer.webm", b"audio")})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "GOOGLE_NOT_CONFIGURED"
    ok(clients["admin"].put("/admin/settings/speech", json={"provider": "local_server"}))
    assert ok(clients["student"].get("/stt/config"))["provider"] == "local_server"
