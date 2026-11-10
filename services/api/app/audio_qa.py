"""Audio Quality Assurance (Audio QA) for English Oral Assessment.

Performs hardware and acoustic health checks before feeding audio to HuBERT:
1. Clipping Detection (Mic saturation, shouting, mic too close to mouth).
2. Signal-to-Noise Ratio (SNR) estimation (Background ambient noise level).
3. Voice Activity & Energy Level (Silent recording, muted mic, breathing only).
"""

from typing import Any, Dict, List
import numpy as np


def assess_audio_quality(samples: np.ndarray, sample_rate: int = 16000) -> Dict[str, Any]:
    """Analyzes 1D float32 audio waveform normalized to [-1.0, 1.0].
    
    Returns structured audio quality report.
    """
    if len(samples) == 0:
        return {
            "status": "POOR",
            "snr_db": 0.0,
            "rms_dbfs": -120.0,
            "clipping_ratio": 0.0,
            "speech_ratio": 0.0,
            "speech_duration": 0.0,
            "duration": 0.0,
            "issues": ["AUDIO_EMPTY"],
            "recommendation": "Audio is empty. Please check microphone connection.",
        }

    duration = float(len(samples)) / float(sample_rate)

    # 1. Clipping Detection (Samples hitting peak ceiling)
    clipped_count = np.sum(np.abs(samples) >= 0.985)
    clipping_ratio = float(clipped_count) / float(len(samples))

    # 2. Overall RMS Energy (dBFS)
    rms = np.sqrt(np.mean(samples ** 2) + 1e-12)
    rms_dbfs = float(20.0 * np.log10(rms))

    # 3. Frame-based Signal-to-Noise Ratio (SNR) and Speech Activity
    frame_len = int(sample_rate * 0.025)  # 25ms
    hop_len = int(sample_rate * 0.010)    # 10ms

    if len(samples) < frame_len:
        return {
            "status": "POOR",
            "snr_db": 0.0,
            "rms_dbfs": round(rms_dbfs, 2),
            "clipping_ratio": round(clipping_ratio, 4),
            "speech_ratio": 0.0,
            "speech_duration": 0.0,
            "duration": round(duration, 2),
            "issues": ["AUDIO_TOO_SHORT"],
            "recommendation": "Audio duration is too short for assessment.",
        }

    # Extract framing with stride_tricks
    num_frames = 1 + (len(samples) - frame_len) // hop_len
    shape = (num_frames, frame_len)
    strides = (samples.strides[0] * hop_len, samples.strides[0])
    frames = np.lib.stride_tricks.as_strided(samples, shape=shape, strides=strides)

    # Log-energy per frame
    frame_energies = np.mean(frames ** 2, axis=1)
    frame_db = 10.0 * np.log10(frame_energies + 1e-12)

    # Noise floor (10th percentile) vs Speech level (90th percentile)
    noise_floor_db = float(np.percentile(frame_db, 10))
    speech_peak_db = float(np.percentile(frame_db, 90))
    snr_db = float(max(0.0, speech_peak_db - noise_floor_db))

    # Active speech frames (at least 8dB above ambient noise floor and above -50dBFS absolute)
    speech_threshold = max(noise_floor_db + 8.0, -50.0)
    speech_mask = frame_db >= speech_threshold
    active_speech_frames = int(np.sum(speech_mask))
    speech_ratio = float(active_speech_frames) / float(num_frames)
    speech_duration = float(active_speech_frames * hop_len) / float(sample_rate)

    # 4. Diagnostic issue flags
    issues: List[str] = []

    if clipping_ratio > 0.05:
        issues.append("AUDIO_CLIPPED")
    elif clipping_ratio > 0.01:
        issues.append("MODERATE_CLIPPING")

    if rms_dbfs < -45.0:
        issues.append("AUDIO_TOO_QUIET")

    if snr_db < 7.0 and duration >= 3.0:
        issues.append("HIGH_BACKGROUND_NOISE")
    elif snr_db < 12.0 and duration >= 3.0:
        issues.append("MODERATE_BACKGROUND_NOISE")

    if duration >= 5.0 and (speech_ratio < 0.12 or speech_duration < 1.0):
        issues.append("INSUFFICIENT_SPEECH")
    elif duration < 5.0 and speech_duration < 0.5:
        issues.append("INSUFFICIENT_SPEECH")

    # 5. Overall Decision Matrix
    # POOR: Severe hardware distortion, mute, or submerged in noise
    if clipping_ratio > 0.05 or rms_dbfs < -50.0 or (snr_db < 7.0 and duration >= 3.0) or (duration >= 5.0 and speech_duration < 0.8):
        status = "POOR"
        if clipping_ratio > 0.05:
            rec = "Âm thanh bị vỡ tiếng (clipping) do nói quá sát micro hoặc âm lượng mic quá lớn. Vui lòng giảm độ nhạy mic và để cách miệng 15-20cm."
        elif rms_dbfs < -50.0:
            rec = "Âm thanh quá nhỏ hoặc micro bị tắt tiếng. Vui lòng kiểm tra cổng cắm mic và tăng âm lượng ghi âm."
        elif snr_db < 7.0:
            rec = "Tạp âm môi trường quá lớn (tiếng quạt, ồn ào xung quanh). Vui lòng di chuyển đến không gian yên tĩnh hơn."
        else:
            rec = "Không phát hiện đủ giọng nói trong bản ghi. Vui lòng nói to, rõ ràng và kiểm tra lại thiết bị."

    # WARNING: Mild noise or occasional soft clipping, but speech is intelligible
    elif issues:
        status = "WARNING"
        rec = "Âm thanh có thể nghe được nhưng chưa tối ưu (" + ", ".join(issues) + "). Nên điều chỉnh lại mic để kết quả chính xác hơn."

    # PASSED: Clean, high-fidelity acoustic condition
    else:
        status = "PASSED"
        rec = "Âm thanh rõ ràng, tỉ lệ tín hiệu trên nhiễu (SNR) đạt tiêu chuẩn chấm thi."

    return {
        "status": status,
        "snr_db": round(snr_db, 2),
        "rms_dbfs": round(rms_dbfs, 2),
        "clipping_ratio": round(clipping_ratio, 4),
        "speech_ratio": round(speech_ratio, 3),
        "speech_duration": round(speech_duration, 2),
        "duration": round(duration, 2),
        "issues": issues,
        "recommendation": rec,
    }
