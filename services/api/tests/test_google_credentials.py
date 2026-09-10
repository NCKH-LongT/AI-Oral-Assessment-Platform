import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select
from test_mvp import ok

from app import google_credentials as credentials
from app.config import settings
from app.models import Audit

ENDPOINT = "/admin/settings/speech/google-credentials"


@pytest.fixture
def credential_env(tmp_path, monkeypatch):
    monkeypatch.setattr(settings(), "data_dir", str(tmp_path))
    monkeypatch.setattr(settings(), "google_stt_credentials_file", "")
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    payload = {
        "type": "service_account",
        "project_id": "synthetic-test-project",
        "client_email": "test@synthetic-test-project.iam.gserviceaccount.com",
        "private_key_id": "synthetic-key-only",
        "private_key": key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        ).decode(),
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    return payload, tmp_path


def upload(client, body, name="credentials.json"):
    raw = json.dumps(body).encode() if isinstance(body, dict) else body
    return client.post(ENDPOINT, files={"file": (name, raw, "application/json")})


def test_admin_upload_shared_storage_metadata_and_restart(env, credential_env):
    clients, factory = env
    payload, folder = credential_env
    before = ok(clients["admin"].get("/admin/settings/speech"))
    for role in ("teacher", "student", "reviewer", "outsider"):
        assert upload(clients[role], payload).status_code == 403
    assert not credentials.managed_path().exists()
    result = ok(upload(clients["admin"], payload))
    assert result["google_configured"]
    assert result["google_credentials"] == {
        "status": "ready",
        "source": "upload",
        "project_id": payload["project_id"],
        "client_email": payload["client_email"],
    }
    assert result["provider"] == before["provider"]
    assert "private_key" not in json.dumps(result)
    path = credentials.managed_path()
    assert path.stat().st_mode & 0o777 == 0o600
    assert path.parent.stat().st_mode & 0o777 == 0o700
    with factory() as db:
        audits = db.scalars(select(Audit).where(Audit.event == "GOOGLE_CREDENTIALS_UPLOADED")).all()
        assert len(audits) == 1
        assert audits[0].details == {
            "project_id": payload["project_id"],
            "client_email": payload["client_email"],
        }
    # A fresh process (as used by worker/restarts) reads the same shared directory without a cache.
    process = subprocess.run(
        [
            sys.executable,
            "-c",
            "from app.google_credentials import status; import json; print(json.dumps(status()))",
        ],
        cwd=Path(__file__).resolve().parents[1],
        env=os.environ | {"DATA_DIR": str(folder)},
        capture_output=True,
        text=True,
        check=True,
    )
    assert json.loads(process.stdout)["source"] == "upload"
    ok(clients["admin"].put("/admin/settings/speech", json={"provider": "google"}))
    # There is no credential download endpoint and students never receive account metadata.
    assert clients["admin"].get(ENDPOINT).status_code == 405
    assert "google_credentials" not in ok(clients["student"].get("/stt/config"))


def test_invalid_upload_keeps_working_key_and_does_not_echo_secrets(env, credential_env, monkeypatch):
    client = env[0]["admin"]
    payload, _ = credential_env
    ok(upload(client, payload))
    original = credentials.managed_path().read_bytes()
    invalid = [
        b"not-json",
        b"[]",
        json.dumps(payload | {"type": "authorized_user"}).encode(),
        json.dumps(payload | {"private_key": "SECRET_INVALID_PEM"}).encode(),
        json.dumps(payload | {"token_uri": "https://attacker.invalid/token"}).encode(),
        json.dumps(payload | {"universe_domain": "attacker.invalid"}).encode(),
    ]
    for body in invalid:
        response = upload(client, body)
        assert response.status_code == 422
        assert "SECRET_INVALID_PEM" not in response.text and "BEGIN PRIVATE KEY" not in response.text
        assert credentials.managed_path().read_bytes() == original
    assert upload(client, payload, "wrong.txt").status_code == 422
    assert upload(client, b"x" * (credentials.MAX_BYTES + 1)).status_code == 413
    assert upload(client, b"").status_code == 413

    def broken_replace(*args):
        raise OSError("Simulated filesystem failure")

    monkeypatch.setattr(credentials.os, "replace", broken_replace)
    assert upload(client, payload).status_code == 503
    assert credentials.managed_path().read_bytes() == original
    assert not list(credentials.managed_path().parent.glob(".google-*"))


def test_uploaded_credentials_priority_and_visible_failure_states(credential_env, monkeypatch):
    payload, folder = credential_env
    legacy = folder / "legacy.json"
    monkeypatch.setattr(settings(), "google_stt_credentials_file", str(legacy))
    assert credentials.status() == {"status": "missing", "source": "environment"}
    legacy.write_text(json.dumps(payload | {"project_id": "legacy-project"}))
    assert credentials.status()["project_id"] == "legacy-project"
    credentials.save(json.dumps(payload).encode())
    assert credentials.load().project_id == payload["project_id"]
    credentials.managed_path().write_text("broken file")
    assert credentials.status() == {"status": "invalid", "source": "upload"}

    def unreadable():
        raise PermissionError("no permission")

    monkeypatch.setattr(credentials, "load", unreadable)
    assert credentials.status() == {"status": "unreadable", "source": "upload"}
