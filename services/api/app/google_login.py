"""Google OIDC authorization code + PKCE. Desktop uses the system browser and one-time polling."""

import base64
import hashlib
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pydantic import Field
from redis import Redis
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Audit, OAuthFlow, User
from .runtime_settings import settings
from .schemas import Input
from .security import cookies, digest, fail, hasher, issue_tokens, public_user

router = APIRouter()


def config():
    cfg = settings()
    if not cfg.google_login_enabled or not cfg.google_client_id or not cfg.google_client_secret:
        fail(409, "GOOGLE_LOGIN_DISABLED", "Admin chưa cấu hình đăng nhập Google")
    return cfg


def limit_flows(request):
    cfg = settings()
    if cfg.redis_url:
        cache = Redis.from_url(cfg.redis_url, socket_timeout=2)
        key = f"google-login:{digest(request.client.host if request.client else 'unknown')}:{int(time.time() // 60)}"
        count = cache.incr(key)
        cache.expire(key, 65)
        if count > 120:
            fail(429, "RATE_LIMITED", "Quá nhiều yêu cầu đăng nhập. Thử lại sau một phút")


def new_flow(db, desktop=False):
    db.execute(delete(OAuthFlow).where(OAuthFlow.expires_at < time.time()))
    poll = secrets.token_urlsafe(48) if desktop else None
    flow = OAuthFlow(
        nonce=secrets.token_urlsafe(32),
        verifier=secrets.token_urlsafe(48),
        poll_hash=digest(poll) if poll else None,
        expires_at=time.time() + 300,
    )
    db.add(flow)
    db.flush()
    return flow, poll


@router.get("/auth/google/config")
def public_config():
    cfg = settings()
    return {"enabled": bool(cfg.google_login_enabled and cfg.google_client_id and cfg.google_client_secret)}


@router.post("/auth/google/desktop")
def desktop_flow(request: Request, db: Session = Depends(get_db)):
    cfg = config()
    limit_flows(request)
    flow, poll = new_flow(db, desktop=True)
    db.commit()
    return {
        "flow_id": flow.id,
        "poll_token": poll,
        "url": cfg.public_origin + "/api/auth/google/start?" + urlencode({"flow_id": flow.id}),
        "expires_in": 300,
    }


@router.get("/auth/google/start")
def start(
    request: Request, flow_id: str | None = Query(default=None, max_length=36), db: Session = Depends(get_db)
):
    cfg = config()
    limit_flows(request)
    if flow_id:
        flow = db.scalar(select(OAuthFlow).where(OAuthFlow.id == flow_id).with_for_update())
        if not flow or not flow.poll_hash or flow.state_hash or flow.expires_at < time.time():
            fail(400, "INVALID_FLOW", "Yêu cầu đăng nhập hết hạn; hãy mở lại từ ứng dụng")
    else:
        flow, _ = new_flow(db)
    state = secrets.token_urlsafe(48)
    flow.state_hash = digest(state)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(flow.verifier.encode()).digest()).rstrip(b"=").decode()
    )
    response = RedirectResponse(
        "https://accounts.google.com/o/oauth2/v2/auth?"
        + urlencode(
            {
                "client_id": cfg.google_client_id,
                "redirect_uri": cfg.public_origin + "/api/auth/google/callback",
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "nonce": flow.nonce,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "prompt": "select_account",
            }
        ),
        status_code=302,
    )
    response.set_cookie(
        "google_oauth_state",
        state,
        httponly=True,
        secure=cfg.public_origin.startswith("https://"),
        samesite="lax",
        max_age=300,
        path="/api/auth/google",
    )
    db.commit()
    return response


def verify_identity(code, flow, cfg):
    response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": cfg.google_client_id,
            "client_secret": cfg.google_client_secret,
            "code": code,
            "code_verifier": flow.verifier,
            "grant_type": "authorization_code",
            "redirect_uri": cfg.public_origin + "/api/auth/google/callback",
        },
        timeout=20,
    )
    response.raise_for_status()
    claims = id_token.verify_oauth2_token(response.json()["id_token"], GoogleRequest(), cfg.google_client_id)
    if (
        claims.get("nonce") != flow.nonce
        or claims.get("email_verified") is not True
        or not isinstance(claims.get("sub"), str)
        or not 1 <= len(claims["sub"]) <= 255
        or not isinstance(claims.get("email"), str)
        or len(claims["email"]) > 320
    ):
        raise ValueError("Invalid identity")
    return claims


@router.get("/auth/google/callback")
def callback(
    request: Request, state: str = "", code: str = "", error: str = "", db: Session = Depends(get_db)
):
    cfg = config()
    cookie = request.cookies.get("google_oauth_state", "")
    if not state or not cookie or not secrets.compare_digest(state, cookie):
        fail(400, "INVALID_STATE", "Phiên Google không hợp lệ; vui lòng đăng nhập lại")
    flow = db.scalar(select(OAuthFlow).where(OAuthFlow.state_hash == digest(state)).with_for_update())
    if not flow or flow.consumed or flow.expires_at < time.time():
        fail(400, "INVALID_STATE", "Phiên Google đã dùng hoặc hết hạn")
    flow.consumed = True
    db.commit()
    failure = RedirectResponse(cfg.public_origin + "/?login_error=google", status_code=303)
    failure.delete_cookie("google_oauth_state", path="/api/auth/google")
    if error or not code:
        flow.failed = True
        db.commit()
        return failure
    try:
        claims = verify_identity(code, flow, cfg)
    except Exception:
        flow.failed = True
        db.commit()
        return failure
    user = db.scalar(select(User).where(User.google_sub == claims["sub"]))
    if not user:
        # Never link to a password account merely because its username matches an email.
        user = User(
            username="google_" + digest(claims["sub"])[:40],
            email=claims["email"],
            google_sub=claims["sub"],
            name=(str(claims.get("name") or claims["email"]))[:150],
            role="STUDENT",
            password_hash=hasher.hash(secrets.token_urlsafe(48)),
        )
        db.add(user)
        db.flush()
    if user.status != "ACTIVE":
        flow.failed = True
        db.commit()
        return failure
    user.email = claims["email"]
    flow.user_id, flow.completed = user.id, True
    db.add(Audit(user_id=user.id, event="GOOGLE_LOGIN", details={"desktop": bool(flow.poll_hash)}))
    if flow.poll_hash:
        response = HTMLResponse(
            '<!doctype html><html lang="vi"><meta charset="utf-8"><title>OralAI</title><h1>Đã đăng nhập Google</h1><p>Quay lại ứng dụng OralAI để tiếp tục. Bạn có thể đóng trang này.</p></html>'
        )
    else:
        response = RedirectResponse(cfg.public_origin + "/", status_code=303)
        access, refresh = issue_tokens(db, user)
        cookies(response, access, refresh)
    response.delete_cookie("google_oauth_state", path="/api/auth/google")
    response.headers["Referrer-Policy"] = "no-referrer"
    db.commit()
    return response


class PollIn(Input):
    flow_id: str = Field(max_length=36)
    poll_token: str = Field(min_length=32, max_length=100)


@router.post("/auth/google/poll")
def poll(body: PollIn, response: Response, db: Session = Depends(get_db)):
    config()
    flow = db.scalar(select(OAuthFlow).where(OAuthFlow.id == body.flow_id).with_for_update())
    if (
        not flow
        or not flow.poll_hash
        or not secrets.compare_digest(flow.poll_hash, digest(body.poll_token))
        or flow.expires_at < time.time()
    ):
        fail(400, "INVALID_FLOW", "Phiên đăng nhập desktop đã dùng hoặc hết hạn")
    if not flow.completed:
        if flow.failed:
            fail(400, "GOOGLE_LOGIN_FAILED", "Google chưa đăng nhập thành công. Vui lòng thử lại")
        return {"pending": True}
    user = db.get(User, flow.user_id)
    if not user or user.status != "ACTIVE":
        fail(403, "ACCOUNT_DISABLED", "Tài khoản không hoạt động")
    flow.poll_hash = None
    access, refresh = issue_tokens(db, user)
    cookies(response, access, refresh)
    db.commit()
    return {"pending": False, "user": public_user(user)}
