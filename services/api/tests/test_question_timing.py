import time

from sqlalchemy import select
from test_examination import setup_workflow
from test_mvp import ok, prepare, start

from app.models import Attempt


def test_defaults_prepare_idempotency_start_gate_and_recording_deadline(env):
    context = prepare(env, 2)
    session = start(env, context)
    student, factory = env[0]["student"], env[1]
    question = session["current_attempt"]
    assert session["timed_questions"]
    assert question["preparation_seconds"] == 10 and question["recording_seconds"] == 60
    path = f"/question-attempts/{question['id']}"
    clock = ok(student.post(path + "/prepare"))
    assert 9 <= clock["ready_at"] - clock["server_time"] <= 10
    assert ok(student.post(path + "/prepare"))["ready_at"] == clock["ready_at"]
    assert student.post(path + "/start").json()["error"]["code"] == "PREPARATION_PENDING"
    with factory() as db:
        attempt = db.get(Attempt, question["id"])
        attempt.prepared_at -= 11
        second = db.scalar(select(Attempt).where(Attempt.session_id == session["id"], Attempt.sequence == 2))
        second_id = second.id
        db.commit()
    assert student.post(f"/question-attempts/{second_id}/prepare").json()["error"]["code"] == "QUESTION_ORDER"
    started = ok(student.post(path + "/start"))
    assert 59 <= started["recording_deadline"] - started["server_time"] <= 60
    assert ok(student.post(path + "/start"))["recording_deadline"] == started["recording_deadline"]
    assert ok(student.post(path + "/prepare"))["recording_deadline"] == started["recording_deadline"]
    with factory() as db:
        db.get(Attempt, question["id"]).started_at = time.time() - 61
        db.commit()
    assert student.post(path + "/start").json()["error"]["code"] == "ANSWER_EXPIRED"
    assert env[0]["outsider"].post(path + "/prepare").status_code == 403


def test_teacher_saves_individual_question_times(env):
    clients, factory, key, context = setup_workflow(env)
    teacher = clients["teacher"]
    draft = ok(teacher.post(f"/admin/exams/{key}/generate"))["snapshot"]
    from app.examination_schemas import DraftQuestion
    questions = [DraftQuestion(**{k: v for k, v in q.items() if k in DraftQuestion.model_fields}).model_dump() for q in draft["questions"]]
    questions[0].update(preparation_seconds=15, recording_seconds=90)
    body = {"questions": questions, "criteria": draft["criteria"]}
    ok(teacher.put(f"/admin/exams/{key}/draft", json=body))
    saved = ok(teacher.get(f"/admin/exams/{key}/draft"))["snapshot"]["questions"][0]
    assert saved["preparation_seconds"] == 15 and saved["recording_seconds"] == 90
    for field, invalid in [("preparation_seconds", -1), ("recording_seconds", 0), ("recording_seconds", 1.5)]:
        changed = body | {"questions": [q | {field: invalid} for q in questions]}
        assert teacher.put(f"/admin/exams/{key}/draft", json=changed).status_code == 422
