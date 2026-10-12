"""Candidate endpoints expose submission receipts; staff-only routes retain grades."""
import pytest
from sqlalchemy import select
from test_mvp import ok, prepare, start

from app.models import Attempt, Course, ExamSession, User


@pytest.mark.parametrize("status", ["SUBMITTED", "REVIEW_REQUIRED", "COMPLETED"])
def test_no_candidate_endpoint_discloses_grades_or_worker_details(env, status):
    clients, factory = env
    context = prepare(env, 1)
    session = start(env, context)
    sid, eid, cid = session["id"], context["exam"]["id"], context["course"]["id"]
    with factory() as db:
        sitting = db.get(ExamSession, sid)
        sitting.status, sitting.final_score, sitting.ai_score = status, 8.25, 8.25
        attempt = db.get(Attempt, session["current_attempt"]["id"])
        attempt.status = "GRADED"
        attempt.assessment = {"score": 8.25, "confidence": .95, "review_required": False}
        db.commit()
    candidate = clients["student"]
    receipts = [ok(candidate.get(f"/exam-sessions/{sid}")),
                ok(candidate.post(f"/exam-sessions/{sid}/finish")),
                ok(candidate.post("/exam-sessions", json={"exam_id": eid}))]
    available = next(e for e in ok(candidate.get("/exams/available")) if e["id"] == eid)
    receipts += [available, *available["history"]]
    forbidden = {"final_score", "ai_score", "score_summary", "assessment", "assessments",
                 "grading_message", "processing", "transcript", "manual_review"}
    for receipt in receipts:
        assert receipt["status"] == "SUBMITTED"
        assert not forbidden & receipt.keys()
    for path in ["/admin/results", f"/admin/results/{sid}",
                 f"/admin/courses/{cid}/results?exam_id={eid}", f"/admin/exams/{eid}/grades.xlsx"]:
        assert candidate.get(path).status_code == 403
    assert candidate.post(f"/admin/results/{sid}/manual-grade",
                          json={"score": 10, "reason": "Attempted self grading"}).status_code == 403
    assert clients["teacher"].get(f"/admin/results/{sid}").status_code == 403
    with factory() as db:
        db.get(Course, cid).owner_id = db.scalar(select(User.id).where(User.username == "teacher"))
        db.commit()
    for name in ["admin", "teacher", "reviewer"]:  # reviewer fixture is EXAM_OFFICER
        review = ok(clients[name].get(f"/admin/results/{sid}"))
        assert review["status"] == status
        assert review["score_summary"]["total_score"] == 8.25
        assert review["final_score"] == (8.25 if status == "COMPLETED" else None)
    assert clients["outsider"].get(f"/exam-sessions/{sid}").status_code == 403
