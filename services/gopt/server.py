import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock

from engine import Engine
from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool

log = logging.getLogger("oral.gopt")
gate = Lock()
MAX_BYTES = int(os.environ.get("GOPT_MAX_AUDIO_MB", "24")) * 1024 * 1024


@asynccontextmanager
async def lifespan(app):
    app.state.engine = await run_in_threadpool(Engine)
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)


@app.get("/health")
def health():
    return {"status": "ready", "model": "gopt-librispeech", "busy": gate.locked()}


def score(engine, audio, transcript):
    with tempfile.TemporaryDirectory(prefix="gopt-") as temporary:
        folder = Path(temporary)
        size = 0
        with (folder / "input.audio").open("wb") as target:
            while chunk := audio.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "Audio too large")
                target.write(chunk)
        if not size:
            raise HTTPException(422, "Audio is empty")
        return engine.assess(folder, transcript)


@app.post("/assess")
async def assess(request: Request):
    if not gate.acquire(blocking=False):
        raise HTTPException(429, "GOPT is processing another answer", headers={"Retry-After": "10"})
    try:
        async with request.form(max_files=1, max_fields=1) as form:
            audio, transcript = form.get("audio"), form.get("transcript")
            if not hasattr(audio, "file") or not isinstance(transcript, str) or not 0 < len(transcript) <= 6000:
                raise HTTPException(422, "Audio and English transcript are required")
            return await run_in_threadpool(score, request.app.state.engine, audio, transcript)
    except HTTPException:
        raise
    except TimeoutError:
        raise HTTPException(504, "GOPT processing deadline exceeded") from None
    except ValueError:
        raise HTTPException(422, "Audio or transcript cannot be aligned with the English model") from None
    except Exception as exc:
        log.error("gopt_failed type=%s", type(exc).__name__)
        raise HTTPException(503, "GOPT processing failed") from None
    finally:
        gate.release()


class UploadLimit:
    def __init__(self, application):
        self.application = application

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] != "/assess":
            return await self.application(scope, receive, send)
        size = 0

        async def limited_receive():
            nonlocal size
            message = await receive()
            size += len(message.get("body", b""))
            if size > MAX_BYTES + 65536:
                raise HTTPException(413, "Request too large")
            return message

        await self.application(scope, limited_receive, send)


app.add_middleware(UploadLimit)
