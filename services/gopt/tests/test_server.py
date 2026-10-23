from threading import Event, Thread

import pytest
import server
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    class Engine:
        def assess(self, folder, transcript):
            assert (folder / "input.audio").read_bytes() == b"audio"
            return {"status": "COMPLETED", "transcript": transcript}

    monkeypatch.setattr(server, "Engine", Engine)
    with TestClient(server.app) as client:
        yield client


def submit(client, audio=b"audio"):
    return client.post("/assess", data={"transcript": "Hello world"}, files={"audio": ("answer.webm", audio)})


def test_request_validates_and_cleans_temporary_audio(client):
    assert submit(client).json() == {"status": "COMPLETED", "transcript": "Hello world"}
    assert submit(client, b"").status_code == 422
    assert client.get("/health").json()["busy"] is False


def test_concurrent_request_rejected_without_blocking_health(client, monkeypatch):
    entered, release = Event(), Event()

    def process(*args):
        entered.set()
        assert release.wait(5)
        return {"status": "COMPLETED"}

    monkeypatch.setattr(server, "score", process)
    running = Thread(target=submit, args=(client,))
    running.start()
    try:
        assert entered.wait(5)
        assert submit(client).status_code == 429
        assert client.get("/health").json()["busy"] is True
    finally:
        release.set()
        running.join(5)
    assert not running.is_alive()
    assert client.get("/health").json()["busy"] is False


@pytest.mark.parametrize("error,status", [(ValueError("secret"), 422), (TimeoutError("secret"), 504),
                                        (RuntimeError("secret"), 503)])
def test_errors_are_safe_and_release_lock(client, monkeypatch, error, status):
    def broken(*args):
        raise error

    monkeypatch.setattr(server, "score", broken)
    response = submit(client)
    assert response.status_code == status and "secret" not in response.text
    assert client.get("/health").json()["busy"] is False


def test_body_limit_rejects_before_inference(client, monkeypatch):
    monkeypatch.setattr(server, "MAX_BYTES", 5)
    assert submit(client, b"too much audio").status_code == 413
    assert client.post("/assess", content=b"a" * 70000,
                       headers={"Content-Type": "multipart/form-data; boundary=invalid"}).status_code in {400, 413}
    assert not server.gate.locked()
