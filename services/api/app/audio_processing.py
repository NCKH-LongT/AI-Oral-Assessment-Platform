"""Shared desktop/server audio preparation. Original evidence is never modified."""

import os
import shutil
import subprocess
import wave
from pathlib import Path


def prepare_audio(source: Path, target: Path, mode="denoise"):
    if mode not in {"off", "denoise"}:
        raise ValueError("Unknown audio preprocessing mode")
    filters = (
        "aresample=16000,highpass=f=80,lowpass=f=7600,afftdn=nr=12:nf=-35:tn=1,loudnorm=I=-18:TP=-2:LRA=11"
    )
    binary = os.getenv("FFMPEG_BINARY") or shutil.which("ffmpeg")
    if not binary:
        from imageio_ffmpeg import get_ffmpeg_exe

        binary = get_ffmpeg_exe()
    command = [
        binary,
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        str(source),
        "-vn",
        "-t",
        "601",
    ]
    if mode == "denoise":
        command += ["-af", filters]
    command += ["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(target)]
    subprocess.run(command, check=True, timeout=120, capture_output=True)
    with wave.open(str(target), "rb") as audio:
        duration = audio.getnframes() / audio.getframerate()
    if not 0 < duration <= 600:
        raise ValueError("Mỗi câu trả lời cần từ hơn 0 đến 600 giây audio")
    return {
        "preprocessing": mode,
        "sample_rate": 16000,
        "duration_seconds": round(duration, 3),
        "pipeline_version": "speech-clean-v1",
    }
