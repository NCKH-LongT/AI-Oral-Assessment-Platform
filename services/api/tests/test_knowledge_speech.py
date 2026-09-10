import io
import wave
from types import SimpleNamespace

import httpx
import numpy as np
import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from sqlalchemy import select
from test_mvp import ok, prepare, start, upload

from app import ai, routes_admin, speech, stt, worker
from app.audio_processing import prepare_audio
from app.documents import heading_chunks, suggest_sections
from app.models import Attempt, Course, Document, Exam, ReviewJob, TopicDocument


def textbook():
    pdf = PdfWriter()
    for text in ["Chapter 1: Dependency injection", "1.1 Constructor injection", "Chapter 2: Databases"]:
        page = pdf.add_blank_page(width=612, height=792)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): pdf._add_object(font)})}
        )
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 18 Tf 50 720 Td ({text}) Tj ET".encode())
        page[NameObject("/Contents")] = pdf._add_object(stream)
    parent = pdf.add_outline_item("Chapter 1: Injection", 0)
    pdf.add_outline_item("1.1 Constructor", 1, parent=parent)
    pdf.add_outline_item("Chapter 2: Databases", 2)
    buffer = io.BytesIO()
    pdf.write(buffer)
    return buffer.getvalue()


def add_book(admin, course_id):
    root = f"/admin/courses/{course_id}"
    result = ok(
        admin.post(
            root + "/documents",
            data={"kind": "TEXTBOOK"},
            files={"file": ("textbook.pdf", textbook(), "application/pdf")},
        ),
        201,
    )
    assert worker.tick()
    workspace = ok(admin.get(root + "/workspace"))
    book = next(d for d in workspace["documents"] if d["id"] == result["id"])
    assert book["status"] == "READY"
    assert book["page_count"] == 3
    return book, workspace["chapters"]


def test_multiple_mappings_and_frozen_knowledge(env):
    context = prepare(env, count=1)
    admin = env[0]["admin"]
    course_id, topic_id = context["course"]["id"], context["topic"]["id"]
    book, chapters = add_book(admin, course_id)
    assert sorted((c["level"], c["start_page"], c["end_page"]) for c in chapters) == [
        (1, 1, 2),
        (1, 3, 3),
        (2, 2, 2),
    ]
    assert (
        admin.post(
            f"/admin/courses/{course_id}/documents",
            data={"kind": "TEXTBOOK"},
            files={"file": ("duplicate.pdf", textbook())},
        ).status_code
        == 409
    )
    lo2 = ok(
        admin.post(
            f"/admin/courses/{course_id}/outcomes",
            json={"code": "LO2", "description": "Compare constructors"},
        ),
        201,
    )
    chapter = next(c for c in chapters if c["start_page"] == 1)
    body = {
        "name": "Expanded topic",
        "learning_outcome_ids": [context["topic"]["learning_outcome_id"], lo2["id"]],
        "chapter_ids": [chapter["id"]],
        "document_ids": [],
    }
    result = ok(admin.put(f"/admin/topics/{topic_id}", json=body))
    assert len(result["learning_outcome_ids"]) == 2
    with env[1]() as db:
        current = ai.retrieve(db, course_id, topic_id, "injection")
        assert {c["document_id"] for c in current} == {book["id"]}
        assert {c["page"] for c in current} == {1, 2}
        exam = db.get(Exam, context["exam"]["id"])
        frozen_ids = exam.snapshot["topic_chunk_ids"][topic_id]
        old = ai.retrieve(db, course_id, topic_id, "injection", exam.snapshot["document_ids"], frozen_ids)
        assert {c["document_id"] for c in old} == {context["document"]["id"]}
        assert len(exam.snapshot["questions"][0]["learning_outcome_ids"]) == 1
    body["document_ids"] = [context["document"]["id"]]
    body["chapter_ids"] = [c["id"] for c in chapters if c["level"] == 1]
    shared = ok(admin.post(f"/admin/courses/{course_id}/topics", json=body), 201)
    assert len(shared["chapter_ids"]) == 2
    body["document_ids"] = [book["id"]]
    assert admin.put(f"/admin/topics/{topic_id}", json=body).status_code == 422
    other = ok(admin.post("/admin/courses", json={"code": "OTHER", "name": "Other course"}), 201)
    other_lo = ok(
        admin.post(f"/admin/courses/{other['id']}/outcomes", json={"code": "X", "description": "Other LO"}),
        201,
    )
    body["document_ids"], body["learning_outcome_ids"] = [], [other_lo["id"]]
    assert admin.put(f"/admin/topics/{topic_id}", json=body).status_code == 422
    assert (
        admin.put(
            f"/admin/chapters/{chapter['id']}", json={"title": "Bad range", "start_page": 1, "end_page": 4}
        ).status_code
        == 422
    )
    assert (
        env[0]["teacher"]
        .put(f"/admin/chapters/{chapter['id']}", json={"title": "No access", "start_page": 1, "end_page": 2})
        .status_code
        == 403
    )
    ok(
        admin.put(
            f"/admin/chapters/{chapter['id']}",
            json={"title": "Reviewed chapter", "start_page": 1, "end_page": 1},
        )
    )
    assert admin.delete(f"/admin/chapters/{chapter['id']}").status_code == 409


def test_pdf_fallback_and_invalid_book(env):
    pdf = PdfWriter()
    pdf.add_blank_page(width=100, height=100)
    stream = io.BytesIO()
    pdf.write(stream)
    sections = suggest_sections(stream.getvalue(), [(1, "Chapter 1 Introduction\n1.1 Basics\nSome text")])
    assert [s["level"] for s in sections] == [1, 2]
    assert suggest_sections(stream.getvalue(), [(1, "plain text")])[0]["source"] == "FALLBACK"
    context = prepare(env)
    root = f"/admin/courses/{context['course']['id']}"
    bad = ok(
        env[0]["admin"].post(
            root + "/documents", data={"kind": "TEXTBOOK"}, files={"file": ("bad.pdf", b"not a pdf")}
        ),
        201,
    )
    assert worker.tick()
    with env[1]() as db:
        assert db.get(Document, bad["id"]).status == "FAILED"
    repaired = ok(
        env[0]["admin"].put(f"/admin/documents/{bad['id']}/file", files={"file": ("fixed.pdf", textbook())})
    )
    assert repaired["version"] == 2
    assert worker.tick()
    assert (
        env[0]["admin"]
        .put(f"/admin/documents/{bad['id']}/file", files={"file": ("fixed.pdf", textbook())})
        .status_code
        == 409
    )
    downloaded = env[0]["admin"].get(f"/admin/documents/{bad['id']}/content")
    assert downloaded.status_code == 200 and downloaded.content.startswith(b"%PDF-")
    assert env[0]["student"].get(f"/admin/documents/{bad['id']}/content").status_code == 403
    pieces = list(heading_chunks("Introduction\n1.1 First\nFirst content\n1.2 Second\nSecond content"))
    assert len(pieces) == 3
    assert pieces[-1] == ("1.2 Second", "1.2 Second\nSecond content")


def test_demo_seed_creates_working_mappings(env, monkeypatch):
    from app import seed_demo

    monkeypatch.setattr(seed_demo, "SessionLocal", env[1])
    monkeypatch.setenv("DEMO_PASSWORD", "demo-test-password-123")
    seed_demo.seed()
    seed_demo.seed()
    with env[1]() as db:
        course = db.scalar(select(Course).where(Course.code == "SE101-DEMO"))
        exam = db.scalar(select(Exam).where(Exam.course_id == course.id))
        assert exam.status == "PUBLISHED" and exam.snapshot["topic_chunk_ids"]
        assert db.scalar(select(TopicDocument)) is not None


def test_speech_policy_permissions_and_routing(env, monkeypatch):
    clients, _ = env
    path = "/admin/settings/speech"
    monkeypatch.setattr(speech, "google_ready", lambda: False)
    assert ok(clients["admin"].get(path))["provider"] == "local_server"
    for role in ("teacher", "reviewer", "student"):
        assert clients[role].put(path, json={"provider": "local"}).status_code == 403
        assert clients[role].get(path).status_code == 403
    assert clients["admin"].put(path, json={"provider": "google"}).status_code == 422
    ok(clients["admin"].put(path, json={"provider": "local", "preprocessing": "off", "language": "en"}))
    assert ok(clients["student"].get("/stt/config")) == {
        "provider": "local",
        "preprocessing": "off",
        "language": "en",
    }
    assert clients["student"].post("/stt", files={"file": ("a.webm", b"audio")}).status_code == 409
    for provider in ("local_server", "google"):
        monkeypatch.setattr(speech, "google_ready", lambda: True)
        ok(clients["admin"].put(path, json={"provider": provider, "preprocessing": "denoise"}))

        def transcribe(path, config):
            assert path.read_bytes() == b"audio"
            assert config["provider"] == provider
            return {"transcript": "recognized", "stt_confidence": 0.9}

        monkeypatch.setattr(stt, "transcribe_file", transcribe)
        assert (
            ok(clients["student"].post("/stt", files={"file": ("a.webm", b"audio")}))["transcript"]
            == "recognized"
        )
    assert clients["admin"].put(path, json={"provider": "unexpected"}).status_code == 422


def write_wave(path, samples, rate=16000):
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(samples.astype("<i2").tobytes())


def test_real_audio_filter_preserves_original_and_reduces_rumble(tmp_path):
    rate = 48000
    t = np.arange(rate * 2) / rate
    samples = 5000 * np.sin(2 * np.pi * 440 * t) + 5000 * np.sin(2 * np.pi * 30 * t)
    original, clean = tmp_path / "original.wav", tmp_path / "clean.wav"
    write_wave(original, samples, rate)
    raw = original.read_bytes()
    metadata = prepare_audio(original, clean)
    assert original.read_bytes() == raw
    assert metadata["duration_seconds"] == pytest.approx(2, abs=0.01)
    with wave.open(str(clean), "rb") as audio:
        assert (audio.getnchannels(), audio.getframerate(), audio.getsampwidth()) == (1, 16000, 2)
        output = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2")
    spectrum = np.abs(np.fft.rfft(output))
    assert spectrum[60] / spectrum[880] < 0.3  # 30Hz rumble relative to 440Hz voiced tone.
    with pytest.raises(ValueError):
        prepare_audio(original, clean, "unknown")


def test_google_splits_long_audio_without_loss(tmp_path, monkeypatch):
    from google.oauth2 import service_account

    calls = []
    monkeypatch.setattr(speech, "google_ready", lambda: True)
    monkeypatch.setattr(
        service_account.Credentials,
        "from_service_account_file",
        lambda *a, **k: SimpleNamespace(token="test-token", refresh=lambda _: None),
    )
    real_client = httpx.Client

    def handle(request):
        import base64
        import json

        payload = json.loads(request.content)
        assert request.headers["authorization"] == "Bearer test-token"
        assert payload["config"]["languageCode"] == "vi-VN"
        calls.append(len(base64.b64decode(payload["audio"]["content"])))
        return httpx.Response(
            200,
            json={"results": [{"alternatives": [{"transcript": f"part {len(calls)}", "confidence": 0.9}]}]},
        )

    monkeypatch.setattr(speech.httpx, "Client", lambda: real_client(transport=httpx.MockTransport(handle)))
    path = tmp_path / "long.wav"
    write_wave(path, np.zeros(120 * 16000))
    result = speech.google_transcribe(path, "vi")
    assert calls == [55 * 16000 * 2, 55 * 16000 * 2, 10 * 16000 * 2]
    assert result["transcript"] == "part 1 part 2 part 3"


def test_google_review_history_retry_and_frozen_scope(env, monkeypatch):
    context = prepare(env, count=1)
    clients, factory = env
    session = start(env, context)
    attempt_id = session["current_attempt"]["id"]
    ok(clients["student"].post(f"/question-attempts/{attempt_id}/start"))
    submitted = {"transcript": "Original student answer", "stt_confidence": 0.8}
    ok(
        clients["student"].post(
            f"/question-attempts/{attempt_id}/submit",
            json=submitted,
            headers={"Idempotency-Key": "review-test"},
        )
    )
    upload(clients["student"], attempt_id, "AUDIO")
    upload(clients["student"], attempt_id, "VIDEO")
    ok(clients["student"].post(f"/exam-sessions/{session['id']}/finish"))
    assert worker.tick()
    path = f"/admin/attempts/{attempt_id}/google-review"
    monkeypatch.setattr(routes_admin, "google_ready", lambda: True)
    for role in ("teacher", "reviewer", "student", "outsider"):
        assert clients[role].post(path, json={"reason": "Review this answer"}).status_code == 403
    job = ok(clients["admin"].post(path, json={"reason": "Check noisy recording"}), 202)
    assert ok(clients["admin"].post(path, json={"reason": "Repeated click"}), 202)["id"] == job["id"]

    def transcribe(path, config):
        assert path.read_bytes().startswith(b"\x1aE\xdf\xa3")
        assert config["provider"] == "google"
        return {"transcript": "Corrected Google answer", "stt_confidence": 0.95, "preprocessing": "denoise"}

    monkeypatch.setattr(speech, "transcribe_file", transcribe)
    assert worker.tick()
    review = ok(clients["admin"].get(f"/admin/results/{session['id']}"))
    attempt = review["attempts"][0]
    assert attempt["transcript"] == submitted["transcript"]
    assert attempt["reviews"][0]["result"]["transcript"] == "Corrected Google answer"
    assert attempt["reviews"][0]["status"] == "COMPLETED"
    assert attempt["assessment"]["retrieved_chunks"][0]["document_id"] == context["document"]["id"]
    previous_assessment = attempt["assessment"]
    failed = ok(clients["admin"].post(path, json={"reason": "Second check"}), 202)
    monkeypatch.setattr(
        speech, "transcribe_file", lambda *a: (_ for _ in ()).throw(RuntimeError("provider down"))
    )
    assert worker.tick()
    with factory() as db:
        assert db.get(Attempt, attempt_id).assessment == previous_assessment
        row = db.get(ReviewJob, failed["id"])
        assert row.status == "FAILED" and row.original["transcript"] == "Corrected Google answer"
    retry = ok(clients["admin"].post(path, json={"reason": "Retry provider"}), 202)
    assert retry["id"] != failed["id"]
