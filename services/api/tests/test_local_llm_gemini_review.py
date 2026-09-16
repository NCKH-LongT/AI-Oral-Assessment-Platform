import base64
import io
import json
import wave

import httpx
import pytest
from sqlalchemy import select
from test_mvp import ok, prepare, start, upload

from app import ai, google_credentials, runtime_settings, speech, worker
from app.config import settings
from app.models import Attempt, ReviewJob


def test_environment_ai_wins_over_old_admin_configuration(env, monkeypatch, tmp_path):
    path = tmp_path / "platform.json"
    path.write_text(
        json.dumps(
            {
                "ai_provider": "gemini",
                "llm_model": "old-model",
                "gemini_api_key": "old-key",
                "stt_model": "small",
            }
        )
    )
    monkeypatch.setattr(runtime_settings, "managed_path", lambda: path)
    cfg = settings()
    monkeypatch.setattr(cfg, "ai_config_source", "env")
    monkeypatch.setattr(cfg, "ai_provider", "local")
    monkeypatch.setattr(cfg, "llm_model", "qwen3:8b")
    monkeypatch.setattr(cfg, "gemini_api_key", "")
    current = runtime_settings.settings(fresh=True)
    assert current.ai_provider == "local" and current.llm_model == "qwen3:8b"
    assert current.gemini_api_key == "" and current.stt_model == "small"
    view = ok(env[0]["admin"].get("/admin/settings/platform"))
    assert view["ai_config_source"] == "env" and not view["gemini_key_configured"]
    body = {
        key: view[key]
        for key in (
            "ai_provider",
            "llm_model",
            "embedding_model",
            "stt_model",
            "google_login_enabled",
            "google_client_id",
            "public_origin",
        )
    }
    body.update(ai_provider="gemini", gemini_api_key="must-not-be-persisted")
    saved = ok(env[0]["admin"].put("/admin/settings/platform", json=body))
    assert saved["ai_provider"] == "local" and not saved["gemini_key_configured"]
    assert not runtime_settings.AI_FIELDS.intersection(json.loads(path.read_text()))


@pytest.mark.parametrize("invalid", [False, True])
def test_local_ollama_grades_submitted_text_without_cloud(env, monkeypatch, invalid):
    cfg = settings()
    monkeypatch.setattr(cfg, "ai_provider", "local")
    monkeypatch.setattr(cfg, "llm_model", "qwen3:8b")
    monkeypatch.setattr(cfg, "embedding_model", "nomic-embed-text")
    monkeypatch.setattr(cfg, "gemini_api_key", "")
    inputs = []
    prefixes = set()

    def request(url, *, json: dict, timeout):
        assert url.startswith(cfg.local_llm_url + "/api/")
        if url.endswith("/embed"):
            assert json["dimensions"] == 768 and json["truncate"] is False
            prefixes.add(json["input"].split(":")[0])
            result = {"embeddings": [[1.0] + [0.0] * 767]}
        else:
            assert not json["stream"] and isinstance(json["format"], dict)
            data = __import__("json").loads(json["messages"][1]["content"])
            refs = [c["id"] for c in data["evidence"]]
            if "rubric" in data:
                inputs.append(data)
                output = {
                    "confidence": 0.99,
                    "criteria": [
                        {"name": c["name"], "score": c["max_score"] * 0.8, "comment": "ok"}
                        for c in data["rubric"]
                    ],
                    "missing_concepts": [],
                    "reasoning_summary": "Grounded",
                    "reference_chunk_ids": refs,
                }
                if invalid:
                    output["criteria"][0]["score"] = 999
            else:
                output = {"text": "Explain DI.", "expected_concepts": ["DI"], "reference_chunk_ids": refs}
            result = {"message": {"content": __import__("json").dumps(output)}}
        return httpx.Response(200, json=result, request=httpx.Request("POST", url))

    monkeypatch.setattr(ai.httpx, "post", request)
    context = prepare(env, 1)
    session = start(env, context)
    student = env[0]["student"]
    aid = session["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    ok(
        student.post(
            f"/question-attempts/{aid}/submit",
            json={"transcript": "Local PhoWhisper transcript", "stt_confidence": 0.99},
            headers={"Idempotency-Key": "local-llm-submit"},
        )
    )
    upload(student, aid, "AUDIO")
    upload(student, aid, "VIDEO")
    ok(student.post(f"/exam-sessions/{session['id']}/finish"))
    assert worker.tick()
    final = ok(student.get(f"/exam-sessions/{session['id']}"))
    assert final["status"] == ("REVIEW_REQUIRED" if invalid else "COMPLETED")
    assert final["final_score"] == (None if invalid else 8)
    assert inputs[0]["transcript"] == "Local PhoWhisper transcript"
    assert prefixes == {"search_query", "search_document"}


def test_gemini_audio_review_uses_key_not_json_and_keeps_original(env, monkeypatch, tmp_path):
    context = prepare(env, 1)
    session = start(env, context)
    student = env[0]["student"]
    aid = session["current_attempt"]["id"]
    ok(student.post(f"/question-attempts/{aid}/start"))
    ok(
        student.post(
            f"/question-attempts/{aid}/submit",
            json={"transcript": "original local transcript", "stt_confidence": 0.99},
            headers={"Idempotency-Key": "gemini-review-test"},
        )
    )
    upload(student, aid, "AUDIO")
    upload(student, aid, "VIDEO")
    ok(student.post(f"/exam-sessions/{session['id']}/finish"))
    assert worker.tick()
    admin = env[0]["admin"]
    path = f"/admin/attempts/{aid}/gemini-review"
    monkeypatch.setattr(settings(), "gemini_api_key", "")
    assert (
        admin.post(path, json={"reason": "Check transcription"}).json()["error"]["code"]
        == "GEMINI_NOT_CONFIGURED"
    )
    monkeypatch.setattr(settings(), "gemini_api_key", "test-key")
    assert env[0]["teacher"].post(path, json={"reason": "Check transcription"}).status_code == 403

    def prepare_audio(source, target, mode):
        with wave.open(str(target), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(b"\x01\x00" * (56 * 16000))
        return {"preprocessing": mode}

    frames = []

    def gemini(operation, model, payload):
        assert operation == "generateContent" and model == settings().gemini_stt_model
        encoded = payload["contents"][0]["parts"][0]["inlineData"]
        assert encoded["mimeType"] == "audio/wav"
        with wave.open(io.BytesIO(base64.b64decode(encoded["data"])), "rb") as wav:
            frames.append(wav.getnframes())
        return {
            "candidates": [{"content": {"parts": [{"text": json.dumps({"transcript": "nhận dạng lại"})}]}}]
        }

    monkeypatch.setattr(speech, "prepare_audio", prepare_audio)
    monkeypatch.setattr(ai, "gemini", gemini)
    monkeypatch.setattr(google_credentials, "load", lambda: pytest.fail("Must not load Google STT JSON"))
    job = ok(admin.post(path, json={"reason": "Check transcription"}), 202)
    assert ok(admin.post(path, json={"reason": "Check transcription"}), 202)["id"] == job["id"]
    assert worker.tick()
    assert frames == [55 * 16000, 16000]
    with env[1]() as db:
        attempt = db.get(Attempt, aid)
        review = db.get(ReviewJob, job["id"])
        assert attempt.transcript == "original local transcript"
        assert review.status == "COMPLETED" and review.policy["provider"] == "gemini"
        assert review.result["transcript"] == "nhận dạng lại nhận dạng lại"
        assert review.result["stt_confidence"] == 0 and review.result["confidence_source"] == "unavailable"
        before = attempt.assessment
    monkeypatch.setattr(ai, "gemini", lambda *a: (_ for _ in ()).throw(TimeoutError()))
    ok(admin.post(path, json={"reason": "Retry failed service"}), 202)
    assert worker.tick()
    with env[1]() as db:
        assert db.get(Attempt, aid).assessment == before
        assert db.scalar(select(ReviewJob).where(ReviewJob.status == "FAILED"))
