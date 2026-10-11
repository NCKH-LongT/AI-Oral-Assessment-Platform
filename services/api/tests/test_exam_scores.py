from types import SimpleNamespace

import pytest
from sqlalchemy import select
from test_mvp import ok, prepare, start

from app import worker
from app.grading import score_summary
from app.models import Attempt, ExamSession


@pytest.mark.parametrize("scores,average", [([6, 8, 10], 8), ([0, 6, 9], 5),
                                           ([7, 8, 8], 7.67), ([8, None, 10], None)])
def test_average_is_saved_and_visible_to_student_and_teacher(env, scores, average):
    context = prepare(env, 3)
    session = start(env, context)
    # Students must not see assessment details during an active exam.
    assert session["score_summary"] is None
    with env[1]() as db:
        row = db.get(ExamSession, session["id"])
        row.status = "SUBMITTED"
        attempts = db.scalars(select(Attempt).where(Attempt.session_id == row.id).order_by(Attempt.sequence)).all()
        for attempt, score in zip(attempts, scores):
            attempt.status = "GRADED"
            attempt.assessment = {"score": score, "review_required": False}
        db.flush()
        worker.finalize(db, row)
        assert row.ai_score == average
        assert row.final_score == average
        db.commit()
    student = ok(env[0]["student"].get(f"/exam-sessions/{session['id']}"))
    admin = ok(env[0]["admin"].get(f"/admin/results/{session['id']}"))
    assert student["score_summary"] == admin["score_summary"]
    summary = student["score_summary"]
    assert summary["total_score"] == average
    assert summary["question_count"] == 3
    assert [q["score"] for q in summary["question_scores"]] == scores
    # Regrading one question recalculates the mean but does not publish an
    # unreviewed grade. An existing manual final grade remains distinguishable.
    with env[1]() as db:
        row = db.get(ExamSession, session["id"])
        attempts = db.scalars(select(Attempt).where(Attempt.session_id == row.id).order_by(Attempt.sequence)).all()
        for attempt in attempts:
            attempt.assessment = {"score": 6, "review_required": True}
        db.flush()
        worker.finalize(db, row)
        assert row.ai_score == 6 and row.final_score is None
        row.manual_review = {"score": 7, "reason": "Teacher reviewed recording"}
        worker.finalize(db, row)
        assert row.ai_score == 6 and row.final_score == 7


@pytest.mark.parametrize("assessment", [None, {"score": None}, {"score": float("nan")},
    {"score": float("inf")}, {"score": True}, {"score": "8"}, {"score": -1}, {"score": 11},
    {"score": 8, "error": "failed"}, {"score": 8, "status": "FAILED"}])
def test_missing_or_invalid_question_score_does_not_become_zero(assessment):
    rows = [SimpleNamespace(sequence=1, assessment={"score": 10}),
            SimpleNamespace(sequence=2, assessment=assessment)]
    summary = score_summary(rows, 2)
    assert summary["total_score"] is None
    assert summary["graded_question_count"] == 1


def test_missing_attempt_or_duplicate_sequence_cannot_produce_total():
    rows = [SimpleNamespace(sequence=1, assessment={"score": 8})]
    assert score_summary(rows, 3)["total_score"] is None
    assert score_summary(rows * 2, 2)["total_score"] is None
    assert score_summary([], 0)["total_score"] is None
