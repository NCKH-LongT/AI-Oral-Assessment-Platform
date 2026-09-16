"""Atomic server-side settings shared by API/worker. Never return stored secrets."""

import json
import os
import tempfile
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import Field, SecretStr, model_validator
from sqlalchemy.orm import Session

from .config import settings as base_settings
from .db import get_db
from .models import Audit
from .schemas import Input
from .security import admin, fail

router = APIRouter()
_current = ContextVar("runtime_config", default=None)
AI_FIELDS = {"ai_provider", "llm_model", "embedding_model", "gemini_api_key"}


def managed_path():
    return Path(base_settings().data_dir) / "secrets" / "platform.json"


def read():
    path = managed_path()
    return json.loads(path.read_text()) if path.exists() else {}


def settings(fresh=False):
    if not fresh and _current.get() is not None:
        return _current.get()
    values = read()
    if base_settings().ai_config_source == "env":
        values = {key: value for key, value in values.items() if key not in AI_FIELDS}
    return base_settings().model_copy(update=values) if values else base_settings()


@contextmanager
def snapshot():
    token = _current.set(settings(fresh=True))
    try:
        yield
    finally:
        _current.reset(token)


class PlatformIn(Input):
    ai_provider: str = Field(pattern=r"^(demo|gemini|local)$")
    llm_model: str = Field(pattern=r"^[a-zA-Z0-9._:/-]{1,150}$")
    embedding_model: str = Field(pattern=r"^[a-zA-Z0-9._:/-]{1,150}$")
    stt_model: str = Field(pattern=r"^(tiny|base|small|medium|large-v3|turbo)$")
    google_login_enabled: bool = False
    google_client_id: str = Field(default="", max_length=250)
    public_origin: str = Field(max_length=300)
    gemini_api_key: SecretStr | None = Field(default=None, max_length=500)
    google_client_secret: SecretStr | None = Field(default=None, max_length=500)
    clear_gemini_key: bool = False
    clear_google_secret: bool = False

    @model_validator(mode="after")
    def validate_origin(self):
        from urllib.parse import urlsplit

        origin = urlsplit(self.public_origin)
        if (
            origin.scheme not in {"https", "http"}
            or not origin.hostname
            or origin.username
            or origin.password
            or origin.query
            or origin.fragment
            or origin.path not in {"", "/"}
            or (origin.scheme == "http" and origin.hostname not in {"localhost", "127.0.0.1"})
        ):
            raise ValueError("Domain gốc cần HTTPS, hoặc HTTP localhost; không chứa đường dẫn")
        self.public_origin = self.public_origin.rstrip("/")
        if self.google_client_id and not self.google_client_id.endswith(".apps.googleusercontent.com"):
            raise ValueError("Google Client ID không hợp lệ")
        return self


def view():
    cfg = settings(fresh=True)
    return {
        key: getattr(cfg, key)
        for key in (
            "ai_provider",
            "llm_model",
            "embedding_model",
            "stt_model",
            "google_login_enabled",
            "google_client_id",
            "public_origin",
        )
    } | {
        "ai_config_source": cfg.ai_config_source,
        "gemini_key_configured": bool(cfg.gemini_api_key),
        "google_secret_configured": bool(cfg.google_client_secret),
        "google_redirect_uri": cfg.public_origin + "/api/auth/google/callback",
    }


@router.get("/admin/settings/platform")
def get_settings(user=Depends(admin)):
    return view()


@router.put("/admin/settings/platform")
def save_settings(body: PlatformIn, db: Session = Depends(get_db), user=Depends(admin)):
    # Serialize configuration updates across API processes using the admin rows.
    from sqlalchemy import select

    from .models import User

    db.scalars(select(User).where(User.role == "ADMIN").order_by(User.id).with_for_update()).all()
    cfg = settings(fresh=True)
    values = body.model_dump(
        exclude={"gemini_api_key", "google_client_secret", "clear_gemini_key", "clear_google_secret"}
    )
    for key, clear in (
        ("gemini_api_key", body.clear_gemini_key),
        ("google_client_secret", body.clear_google_secret),
    ):
        secret = getattr(body, key)
        values[key] = (
            ""
            if clear
            else (
                secret.get_secret_value().strip()
                if secret and secret.get_secret_value().strip()
                else getattr(cfg, key)
            )
        )
    if cfg.ai_config_source == "env":
        # Existing platform.json must not silently override deployment AI configuration.
        for key in AI_FIELDS:
            values[key] = getattr(cfg, key)
    if values["ai_provider"] == "gemini" and not values["gemini_api_key"]:
        fail(422, "AI_KEY_REQUIRED", "Nhập API key Gemini trước khi bật AI")
    if values["google_login_enabled"] and not (values["google_client_id"] and values["google_client_secret"]):
        fail(422, "GOOGLE_LOGIN_INCOMPLETE", "Nhập Client ID và Client Secret trước khi bật đăng nhập Google")
    if cfg.ai_config_source == "env":
        values = {key: value for key, value in values.items() if key not in AI_FIELDS}
    path = managed_path()
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    path.parent.chmod(0o700)
    fd, temporary = tempfile.mkstemp(prefix=".platform-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(values, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)
    db.add(Audit(user_id=user.id, event="PLATFORM_SETTINGS_UPDATED", details={"fields": list(values)}))
    db.commit()
    return view()
