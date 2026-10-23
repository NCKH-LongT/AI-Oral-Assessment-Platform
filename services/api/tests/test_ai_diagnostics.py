import json
import logging
from types import SimpleNamespace

import httpx
import pytest

from app import ai, diagnostics


def records(caplog):
    return [json.loads(record.getMessage()) for record in caplog.records if record.name == "oral.diagnostics"]


@pytest.mark.parametrize("failure", ["read_timeout", "connect_timeout", "http_error"])
def test_ollama_failures_are_correlated_without_logging_private_data(monkeypatch, caplog, failure):
    monkeypatch.setattr(ai, "settings", lambda: SimpleNamespace(
        local_llm_url="http://user:private-password@ollama:11434?token=private-token",
        local_llm_timeout=600,
    ))
    calls = []

    def post(url, **kwargs):
        calls.append(kwargs)
        request = httpx.Request("POST", url)
        if failure == "http_error":
            return httpx.Response(503, text="private-response-body", request=request)
        error = httpx.ReadTimeout if failure == "read_timeout" else httpx.ConnectTimeout
        raise error("private-exception-message", request=request)

    monkeypatch.setattr(ai.httpx, "post", post)
    with caplog.at_level(logging.INFO, logger="oral.diagnostics"), \
            diagnostics.context(job_id="review-test", attempt_id="attempt-test"), pytest.raises(httpx.HTTPError):
        ai.ollama("chat", {"model": "qwen2.5:3b", "messages": [{"content": "private-student-answer"}]})
    assert len(calls) == 1
    assert calls[0]["timeout"].read == 600
    assert calls[0]["timeout"].connect == 10
    start, failed = records(caplog)
    assert start["event"] == "operation_started"
    assert failed["event"] == "operation_failed"
    assert failed["stage"] == "ollama.chat"
    assert failed["job_id"] == "review-test" and failed["attempt_id"] == "attempt-test"
    assert failed["timeout_seconds"] == 600
    assert failed["model"] == "qwen2.5:3b"
    assert failed["http_status"] == (503 if failure == "http_error" else None)
    assert failed["elapsed_seconds"] >= 0 and failed["frames"]
    assert "private-" not in caplog.text
    diagnostics.event("outside_review", level=logging.WARNING)
    assert "job_id" not in records(caplog)[-1]


def test_ollama_success_logs_only_numeric_performance_metrics(monkeypatch, caplog):
    monkeypatch.setattr(ai, "settings", lambda: SimpleNamespace(local_llm_url="http://ollama:11434", local_llm_timeout=600))
    response = {"message": {"content": "private-answer"}, "load_duration": 2_000_000_000,
                "eval_count": 123, "total_duration": "private-untrusted-value", "eval_duration": float("inf")}
    monkeypatch.setattr(ai.httpx, "post", lambda *args, **kwargs: SimpleNamespace(
        raise_for_status=lambda: None, json=lambda: response))
    with caplog.at_level(logging.INFO, logger="oral.diagnostics"):
        assert ai.ollama("chat", {"model": "qwen2.5:3b"}) == response
    completed = records(caplog)[-1]
    assert completed["event"] == "operation_completed"
    assert completed["load_duration"] == 2_000_000_000 and completed["eval_count"] == 123
    assert "total_duration" not in completed and "eval_duration" not in completed
    assert "private-" not in caplog.text


def test_gemini_timeout_logs_provider_model_not_credentials(monkeypatch, caplog):
    monkeypatch.setattr(ai, "settings", lambda: SimpleNamespace(gemini_api_key="private-api-key", gemini_timeout=180))

    def post(url, **kwargs):
        assert kwargs["headers"]["x-goog-api-key"] == "private-api-key"
        assert kwargs["timeout"] == 180
        raise httpx.ReadTimeout("private-exception-message")

    monkeypatch.setattr(ai.httpx, "post", post)
    with pytest.raises(httpx.ReadTimeout):
        ai.gemini("generateContent", "gemini-2.5-flash", {"contents": "private-student-answer"})
    failed = records(caplog)[-1]
    assert failed["provider"] == "gemini" and failed["model"] == "gemini-2.5-flash"
    assert failed["exception_type"] == "ReadTimeout" and failed["timeout_seconds"] == 180
    assert "private-" not in caplog.text
