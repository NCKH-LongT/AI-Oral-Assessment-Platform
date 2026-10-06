"""Exercise the helper's JSON output under Windows pipe encodings."""

import importlib.util
import io
import itertools
import json
import os
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch


class DesktopSTTOutputTests(unittest.TestCase):
    def test_transcript_survives_non_utf8_stdout(self):
        # Keep this regression independent of model downloads and native STT
        # dependencies, while executing the real helper's main/output path.
        whisper = ModuleType("faster_whisper")
        whisper.WhisperModel = Mock()
        audio = ModuleType("app.audio_processing")
        metadata = {
            "preprocessing": "off",
            "sample_rate": 16000,
            "duration_seconds": 2.0,
            "pipeline_version": "speech-clean-v1",
        }
        audio.prepare_audio = Mock(return_value=metadata)
        spec = importlib.util.spec_from_file_location(
            "desktop_transcribe",
            Path(__file__).resolve().parents[1] / "apps/desktop/transcribe.py",
        )
        helper = importlib.util.module_from_spec(spec)
        with (
            patch.dict(
                sys.modules,
                {
                    "faster_whisper": whisper,
                    "app.audio_processing": audio,
                },
            ),
            patch.object(sys, "path", sys.path[:]),
        ):
            spec.loader.exec_module(helper)

        for encoding, variant, language in itertools.product(
            ("cp1252", "ascii", "utf-8"), ("phowhisper-small", "whisper-small"), ("vi", "en")
        ):
            with self.subTest(encoding=encoding, variant=variant, language=language):
                transcript = "Đây là câu trả lời tiếng Việt: kiểm thử phần mềm."
                hotwords = [f"Thuật ngữ chuyên ngành {i}" for i in range(200)]
                whisper.WhisperModel.return_value.transcribe.return_value = (
                    iter([SimpleNamespace(text=transcript, avg_logprob=-0.2)]),
                    None,
                )
                raw = io.BytesIO()
                with io.TextIOWrapper(
                    raw, encoding=encoding, errors="strict"
                ) as stdout:
                    with (
                        patch.dict(os.environ, {"STT_HOTWORDS": json.dumps(hotwords), "ORAL_STT_VARIANT": variant, "STT_LANGUAGE": language}),
                        patch.object(sys, "stdout", stdout),
                        patch.object(sys, "argv", ["transcribe.py", "answer.webm"]),
                        patch.object(helper, "model_path", return_value=Path("model")),
                    ):
                        helper.main()
                        self.assertEqual(whisper.WhisperModel.return_value.transcribe.call_args.kwargs["hotwords"], ", ".join(hotwords))
                        self.assertEqual(whisper.WhisperModel.return_value.transcribe.call_args.kwargs["language"], language)
                        self.assertEqual(whisper.WhisperModel.return_value.transcribe.call_args.kwargs["task"], "transcribe")
                    stdout.flush()
                    # Match Electron's UTF-8 decoding of stdout and JSON.parse.
                    result = json.loads(raw.getvalue().decode("utf-8"))
                self.assertEqual(result["transcript"], transcript)
                self.assertEqual(result["provider"], "local")
                self.assertEqual(result["model"], "Whisper-small" if variant == "whisper-small" else "PhoWhisper-small")
                self.assertEqual(result["language"], language)
                self.assertEqual(result["stt_confidence"], 0.8187)
                for key, value in metadata.items():
                    self.assertEqual(result[key], value)

        with (
            patch.dict(os.environ, {"ORAL_STT_VARIANT": "../../arbitrary"}),
            self.assertRaisesRegex(ValueError, "Unsupported desktop STT model"),
        ):
            helper.main()
        with (
            patch.dict(os.environ, {"STT_LANGUAGE": "invalid"}),
            self.assertRaisesRegex(ValueError, "Unsupported desktop STT language"),
        ):
            helper.main()


if __name__ == "__main__":
    unittest.main()
