from copy import deepcopy

import pytest
from test_examination import import_roster, setup_workflow
from test_mvp import ok

from app.models import Assignment, Exam
from app.question_content import validate_content

IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIADAMLsY1kIGtIXCHTzA2Zhr60Lj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSrA7bQR/5SJVK6AAAAAElFTkSuQmCC"
DOCUMENT = {"type": "doc", "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "Describe the picture and explain your answer.", "marks": [{"type": "bold"}]}]},
    {"type": "image", "attrs": {"src": IMAGE, "alt": "Office picture"}},
]}


def test_rich_question_permissions_snapshot_copy_and_student_payload(env):
    clients, factory, key, context = setup_workflow(env)
    teacher, office, admin = [clients[k] for k in ("teacher", "reviewer", "admin")]
    snapshot = ok(teacher.post(f"/admin/exams/{key}/generate"))["snapshot"]
    question = {k: snapshot["questions"][0][k] for k in ("text", "expected_concepts", "reference_chunk_ids", "english_terms")}
    body = {"questions": [question | {"rich_content": DOCUMENT}], "criteria": snapshot["criteria"]}
    endpoint = f"/admin/exams/{key}/draft"
    for actor in (teacher, office, admin):
        ok(actor.put(endpoint, json=body))
    for actor in (clients["student"], clients["outsider"]):
        assert actor.put(endpoint, json=body).status_code == 403
    actual = ok(office.get(endpoint))["snapshot"]["questions"][0]
    assert actual["text"] == "Describe the picture and explain your answer."
    assert actual["rich_content"] == DOCUMENT
    invalid_image = deepcopy(body)
    invalid_image["questions"][0]["rich_content"]["content"][1]["attrs"]["src"] = "javascript:alert(1)"
    assert office.put(endpoint, json=invalid_image).status_code == 422
    # References remain constrained to the question's topic even for an officer.
    invalid = deepcopy(body)
    invalid["questions"][0]["reference_chunk_ids"] = ["outside-topic"]
    assert office.put(endpoint, json=invalid).status_code == 422
    ok(import_roster(office, key))
    ok(teacher.post(f"/admin/exams/{key}/teacher-approve"))
    assert office.put(endpoint, json=body).status_code == 409
    with factory() as db:
        exam = db.get(Exam, key)
        exam.status = "PUBLISHED"
        for assignment in db.query(Assignment).filter_by(exam_id=key):
            assignment.opens_at, assignment.closes_at = 1, 9999999999
        db.commit()
    copied = ok(office.post(f"/admin/exams/{key}/copy?preserve_content=true"), 201)
    assert copied["status"] == "GENERATED"
    copy_snapshot = ok(office.get(f"/admin/exams/{copied['id']}/draft"))["snapshot"]
    assert copy_snapshot["questions"][0]["rich_content"] == DOCUMENT
    assert "teacher_approved_by" not in copy_snapshot
    modified = deepcopy(body)
    modified["questions"][0]["rich_content"]["content"][0]["content"][0]["text"] = "Different picture question for the copy only."
    ok(office.put(f"/admin/exams/{copied['id']}/draft", json=modified))
    assert ok(office.get(endpoint))["snapshot"]["questions"][0] == actual
    student = clients["student"]
    sitting = ok(student.post("/exam-sessions", json={"exam_id": key}))
    started = ok(student.post(f"/exam-sessions/{sitting['id']}/start", json={"screen_consent": True}))
    assert started["current_attempt"]["rich_content"] == DOCUMENT
    assert "expected_concepts" not in started["current_attempt"]
    review = ok(admin.get(f"/admin/results/{sitting['id']}"))
    assert review["attempts"][0]["question"]["rich_content"] == DOCUMENT
    listed = ok(office.get(f"/admin/courses/{context['course']['id']}/workspace"))
    assert next(e for e in listed["exams"] if e["id"] == key)["questions"][0]["rich_content"] == DOCUMENT


@pytest.mark.parametrize("bad", [
    {"type": "script", "text": "alert(1)"},
    {"type": ["paragraph"]},
    {"type": "paragraph", "content": [{"type": "text", "text": "hello", "marks": [{"type": {"bold": True}}]}]},
    {"type": "image", "attrs": {"src": "https://example.com/track.png"}},
    {"type": "image", "attrs": {"src": "data:image/svg+xml;base64,PHN2Zy8+"}},
    {"type": "image", "attrs": {"src": "data:image/png;base64,aGVsbG8="}},
    {"type": "image", "attrs": {"src": IMAGE, "onerror": "alert(1)"}},
    {"type": "paragraph", "content": [{"type": "text", "text": "hello", "marks": [{"type": "link", "attrs": {"href": "javascript:alert(1)"}}]}]},
])
def test_document_rejects_active_and_remote_content(bad):
    with pytest.raises(ValueError):
        validate_content({"type": "doc", "content": [DOCUMENT["content"][0], bad]})


def test_document_limits_and_plain_legacy():
    assert validate_content(None) is None
    assert validate_content(DOCUMENT) == DOCUMENT
    with pytest.raises(ValueError):
        validate_content({"type": "doc", "content": [DOCUMENT["content"][0]] + [DOCUMENT["content"][1]] * 5})
    with pytest.raises(ValueError):
        validate_content({"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x" * 4001}]}]})
