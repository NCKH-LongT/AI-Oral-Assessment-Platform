import numpy as np
import pytest
from audio_qa import assess_audio_quality


def test_empty_audio():
    res = assess_audio_quality(np.array([], dtype=np.float32))
    assert res["status"] == "POOR"
    assert "AUDIO_EMPTY" in res["issues"]


def test_silent_audio():
    # 5 seconds of almost zero sound
    samples = np.random.normal(0, 1e-5, 16000 * 5).astype(np.float32)
    res = assess_audio_quality(samples, sample_rate=16000)
    assert res["status"] == "POOR"
    assert "AUDIO_TOO_QUIET" in res["issues"]
    assert "INSUFFICIENT_SPEECH" in res["issues"]


def test_heavily_clipped_audio():
    # Audio with 20% clipped samples
    samples = np.sin(np.linspace(0, 100 * np.pi, 16000 * 3)).astype(np.float32) * 1.5
    samples = np.clip(samples, -1.0, 1.0)
    res = assess_audio_quality(samples, sample_rate=16000)
    assert res["status"] == "POOR"
    assert "AUDIO_CLIPPED" in res["issues"]
    assert res["clipping_ratio"] > 0.05


def test_clean_speech_like_signal():
    # 5 seconds of signal with periodic bursts (representing words) + quiet pauses
    sr = 16000
    duration = 5.0
    total_samples = int(sr * duration)
    samples = np.zeros(total_samples, dtype=np.float32)
    
    # Add speech bursts with speech-like frequencies (300Hz, 800Hz, 2500Hz)
    t = np.arange(sr) / sr
    burst = (
        0.3 * np.sin(2 * np.pi * 300 * t) +
        0.2 * np.sin(2 * np.pi * 800 * t) +
        0.1 * np.sin(2 * np.pi * 2500 * t)
    ).astype(np.float32)
    
    # 3 words over 5 seconds
    samples[sr * 1 : sr * 2] = burst
    samples[int(sr * 2.5) : int(sr * 3.5)] = burst
    samples[sr * 4 : sr * 5] = burst
    
    # Add gentle background noise
    samples += np.random.normal(0, 0.005, total_samples).astype(np.float32)
    
    res = assess_audio_quality(samples, sample_rate=sr)
    assert res["status"] in ("PASSED", "WARNING")
    assert res["snr_db"] > 10.0
    assert res["speech_duration"] >= 2.0
    assert "AUDIO_CLIPPED" not in res["issues"]
    assert "INSUFFICIENT_SPEECH" not in res["issues"]
