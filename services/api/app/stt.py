import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from .db import get_db
from .security import current_user, fail
from .speech import policy, transcribe_file

router = APIRouter()


@router.post("/stt")
def stt(file: UploadFile = File(), db: Session = Depends(get_db), user=Depends(current_user)):
    config = policy(db)
    if config["provider"] == "local":
        fail(409, "DESKTOP_REQUIRED", "Admin chọn STT local. Vui lòng dùng ứng dụng desktop")
    content = file.file.read(30 * 1024 * 1024 + 1)
    if not content or len(content) > 30 * 1024 * 1024:
        fail(413, "AUDIO_SIZE", "Audio STT phải dưới 30 MB")
    try:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "answer.webm"
            path.write_bytes(content)
            result = transcribe_file(path, config)
    except ImportError:
        fail(503, "STT_UNAVAILABLE", "Cài API với extra [stt] hoặc dùng STT local trong Electron")
    except Exception:
        fail(
            503,
            "STT_FAILED",
            "Không thể nhận dạng audio. Kiểm tra audio (tối đa 10 phút), FFmpeg, model hoặc cấu hình Google rồi thử lại.",
        )
    if not result["transcript"]:
        fail(422, "NO_SPEECH", "Không nhận diện được lời nói. Vui lòng ghi âm lại.")
    return result
