import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from .db import get_db
from .runtime_settings import settings
from .security import current_user, fail
from .speech import google_ready, policy, transcribe_file

router = APIRouter()


@router.post("/stt")
def stt(
    file: UploadFile = File(),
    preprocessing: Literal["off"] | None = Form(default=None),
    db: Session = Depends(get_db),
    user=Depends(current_user),
):
    config = policy(db)
    # New clients handle RNNoise/bypass locally; older clients keep the saved policy.
    if preprocessing == "off":
        config = config | {"preprocessing": "off"}
    if config["provider"] == "local":
        fail(409, "DESKTOP_REQUIRED", "Admin chọn STT local. Vui lòng dùng ứng dụng desktop")
    if config["provider"] == "gemini" and not settings().gemini_api_key:
        fail(503, "GEMINI_NOT_CONFIGURED", "Cấu hình GEMINI_API_KEY trên server để dùng Gemini STT")
    if config["provider"] == "google" and not google_ready():
        fail(
            503,
            "GOOGLE_NOT_CONFIGURED",
            "STT đang chọn Google Cloud nhưng thiếu JSON hợp lệ. Admin cần chọn Whisper trong STT & giọng nói hoặc cấu hình JSON nếu muốn dùng Google STT. Cấu hình Gemini chấm điểm không yêu cầu JSON này.",
        )
    content = file.file.read(30 * 1024 * 1024 + 1)
    if not content or len(content) > 30 * 1024 * 1024:
        fail(413, "AUDIO_SIZE", "Audio STT phải dưới 30 MB")
    try:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "answer.webm"
            path.write_bytes(content)
            result = transcribe_file(path, config)
    except ImportError:
        fail(
            503,
            "STT_UNAVAILABLE",
            "Thiếu thư viện xử lý audio trên máy chủ."
            if config["provider"] == "gemini"
            else "Thiếu thư viện Google STT trên máy chủ."
            if config["provider"] == "google"
            else "Whisper trên máy chủ chưa được cài. Cài API với extra [stt] hoặc chọn Whisper local trong Electron.",
        )
    except Exception:
        fail(
            503,
            "STT_FAILED",
            "Gemini không nhận dạng được audio. Kiểm tra audio, API key, model và quota trên server rồi thử lại."
            if config["provider"] == "gemini"
            else "Google STT không nhận dạng được audio. Kiểm tra audio, FFmpeg, credentials và quyền truy cập Google Cloud rồi thử lại."
            if config["provider"] == "google"
            else "Whisper trên máy chủ không nhận dạng được audio. Kiểm tra audio (tối đa 10 phút), FFmpeg và model Whisper rồi thử lại.",
        )
    if not result["transcript"]:
        fail(422, "NO_SPEECH", "Không nhận diện được lời nói. Vui lòng ghi âm lại.")
    return result
