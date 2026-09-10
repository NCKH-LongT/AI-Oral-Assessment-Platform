"""Private credentials in shared DATA_DIR; only safe metadata may leave this module."""

import json
import os
import tempfile
from pathlib import Path

from google.oauth2 import service_account

from .config import settings

MAX_BYTES = 64 * 1024


def managed_path():
    return Path(settings().data_dir) / "secrets" / "google-stt.json"


def validate(raw):
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError("Invalid credential size")
    data = json.loads(raw)
    if not isinstance(data, dict) or data.get("type") != "service_account":
        raise ValueError("Service account required")
    if data.get("token_uri") != "https://oauth2.googleapis.com/token":
        raise ValueError("Unsupported token endpoint")
    if data.get("universe_domain", "googleapis.com") != "googleapis.com":
        raise ValueError("Unsupported Google domain")
    for field in ("project_id", "client_email", "private_key", "private_key_id"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            raise ValueError("Incomplete credentials")
    if not data["client_email"].endswith(".iam.gserviceaccount.com"):
        raise ValueError("Invalid service account email")
    return service_account.Credentials.from_service_account_info(
        data, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )


def selected_path():
    managed = managed_path()
    # Do not silently switch accounts if an uploaded file becomes corrupt/unreadable.
    if managed.exists():
        return managed, "upload"
    configured = settings().google_stt_credentials_file
    return (Path(configured), "environment") if configured else (None, "none")


def load():
    path, _ = selected_path()
    if path is None:
        raise FileNotFoundError("Google credentials missing")
    with path.open("rb") as stream:
        return validate(stream.read(MAX_BYTES + 1))


def status():
    source = "none"
    try:
        path, source = selected_path()
        if path is None:
            return {"status": "missing", "source": source}
        credentials = load()
        return {
            "status": "ready",
            "source": source,
            "project_id": credentials.project_id,
            "client_email": credentials.service_account_email,
        }
    except FileNotFoundError:
        state = "missing"
    except OSError:
        state = "unreadable"
    except (ValueError, TypeError, KeyError):
        state = "invalid"
    return {"status": state, "source": source}


def save(raw):
    credentials = validate(raw)
    path = managed_path()
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    path.parent.chmod(0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=".google-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return {"project_id": credentials.project_id, "client_email": credentials.service_account_email}
