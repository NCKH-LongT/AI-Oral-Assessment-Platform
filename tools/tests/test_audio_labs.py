import importlib.util
import json
import math
import os
import struct
import threading
import wave
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


gopt = module("gopt_lab", TOOLS / "gopt-lab/gopt_lab.py")
hubert = module("hubert_lab", TOOLS / "hubert-lab/compare.py")
RESULT = {
    "status": "COMPLETED",
    "model": "gopt-librispeech",
    "model_revision": "test-revision",
    "scores": dict.fromkeys(gopt.SCORES, 7.5),
    "segments": 1,
    "phones": 10,
    "reference_source": "transcript",
}


def wav(path, seconds=1, silent=False):
    with wave.open(str(path), "wb") as target:
        target.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        target.writeframes(
            b"".join(
                struct.pack(
                    "<h",
                    0
                    if silent
                    else int(6000 * math.sin(i * 2 * math.pi * 220 / 16000)),
                )
                for i in range(int(16000 * seconds))
            )
        )


def test_gopt_http_multipart_partial_failure_and_csv(tmp_path):
    audio = tmp_path / "audio.wav"
    wav(audio)
    observed = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            parsed = BytesParser(policy=policy.default).parsebytes(
                (
                    "Content-Type: "
                    + self.headers["Content-Type"]
                    + "\r\nMIME-Version: 1.0\r\n\r\n"
                ).encode()
                + body
            )
            fields = {
                part.get_param("name", header="content-disposition"): part
                for part in parsed.iter_parts()
            }
            assert fields["audio"].get_payload(decode=True) == audio.read_bytes()
            text = fields["transcript"].get_payload(decode=True).decode()
            observed.append(text)
            self.send_response(422 if text == "wrong" else 200)
            self.end_headers()
            self.wfile.write(json.dumps(RESULT).encode())

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    manifest = tmp_path / "experiment.json"
    manifest.write_text(
        json.dumps(
            {
                "cases": [
                    {"name": str(i), "audio": audio.name, "transcript": text}
                    for i, text in enumerate(["I like coffee", "wrong", "coffee"])
                ]
            }
        )
    )
    try:
        assert (
            gopt.main(
                [
                    str(manifest),
                    "--url",
                    f"http://127.0.0.1:{server.server_port}",
                    "--csv",
                    str(tmp_path / "table.csv"),
                ]
            )
            == 1
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    report = json.loads((tmp_path / "gopt-results.json").read_text(encoding="utf-8"))
    assert observed == ["I like coffee", "wrong", "coffee"]
    assert report["cases"][0]["response"] == RESULT
    assert report["cases"][1]["http_status"] == 422
    assert "response" not in report["cases"][1]
    assert report["cases"][2]["response"]["scores"]["total"] == 7.5
    assert (
        "transcript"
        not in (tmp_path / "table.csv").read_text(encoding="utf-8-sig").splitlines()[0]
    )


@pytest.mark.parametrize(
    "bad",
    [
        None,
        [],
        {"status": "FAILED"},
        RESULT | {"scores": {**RESULT["scores"], "total": float("nan")}},
        RESULT | {"phones": True},
    ],
)
def test_gopt_rejects_invalid_response(bad):
    with pytest.raises(ValueError):
        gopt.validate_response(bad)


def test_cli_does_not_overwrite_inputs_and_validates_before_loading_model(tmp_path):
    audio = tmp_path / "audio.wav"
    wav(audio)
    manifest = tmp_path / "experiment.json"
    manifest.write_text(
        json.dumps(
            {
                "reference": audio.name,
                "cases": [{"name": "a", "audio": audio.name, "transcript": "coffee"}],
            }
        )
    )
    original = audio.read_bytes()
    for lab in (gopt, hubert):
        with pytest.raises(SystemExit) as error:
            lab.main([str(manifest), "--output", str(audio)])
        assert error.value.code == 2
    assert audio.read_bytes() == original
    with pytest.raises(SystemExit):
        gopt.main([str(manifest), "--timeout", "nan"])
    with pytest.raises(SystemExit):
        hubert.main([str(manifest), "--revision", "main"])


def test_hubert_cosine_is_finite_and_never_a_grade():
    pytest.importorskip("numpy")
    assert hubert.cosine([1, 2], [1, 2]) == pytest.approx(1)
    assert hubert.cosine([1, 0], [-1, 0]) == -1
    for a, b in [([0, 0], [1, 2]), ([1, float("nan")], [1, 2]), ([1], [1, 2])]:
        with pytest.raises(ValueError):
            hubert.cosine(a, b)


@pytest.mark.parametrize("seconds,silent", [(0.1, False), (31, False), (1, True)])
def test_hubert_rejects_short_long_and_silent_audio(tmp_path, seconds, silent):
    pytest.importorskip("numpy")
    pytest.importorskip("imageio_ffmpeg")
    audio = tmp_path / "audio.wav"
    wav(audio, seconds, silent)
    with pytest.raises(ValueError):
        hubert.read_audio(audio, hubert.ffmpeg_binary())


@pytest.mark.skipif(
    os.environ.get("RUN_HUBERT_MODEL") != "1",
    reason="Opt-in real cached checkpoint test",
)
def test_real_hubert_cpu_same_audio_control(tmp_path):
    audio = tmp_path / "audio.wav"
    wav(audio)
    manifest = tmp_path / "experiment.json"
    manifest.write_text(
        json.dumps(
            {"reference": audio.name, "cases": [{"name": "same", "audio": audio.name}]}
        )
    )
    assert hubert.main([str(manifest), "--offline"]) == 0
    report = json.loads((tmp_path / "hubert-results.json").read_text())
    assert report["cases"][0]["cosine_similarity"] == pytest.approx(1, abs=1e-6)
    assert report["device"] == "cpu" and report["revision"] == hubert.REVISION
    assert "scores" not in report["cases"][0]
