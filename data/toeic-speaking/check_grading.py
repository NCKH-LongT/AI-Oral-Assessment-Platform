"""Read-only calibration against the installed course; calls the configured LLM.

Does not create an exam session or save a student's grade. Run in the API container.
"""
import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, "/app")

from app.db import SessionLocal
from app.models import Course, Exam
from app.runtime_settings import snapshot
from app.worker import grade_answer
from sqlalchemy import select


def main():
    samples = json.loads(Path(__file__).with_name("calibration.json").read_text())["samples"]
    results = []
    with snapshot(), SessionLocal() as db:
        course = db.scalar(select(Course).where(Course.code == "TOEIC-SPEAKING-01"))
        if not course:
            raise RuntimeError("Import khóa học trước khi kiểm tra")
        exam = db.scalar(select(Exam).where(Exam.course_id == course.id, Exam.status == "PUBLISHED").order_by(Exam.created_at.desc()))
        for sample in samples:
            question = next(q for q in exam.snapshot["questions"] if q["authored_id"] == sample["question_id"])
            now = time.time()
            grade = grade_answer(db, exam, SimpleNamespace(started_at=now),
                                 SimpleNamespace(question=question, finished_at=now), sample["transcript"], 1)
            low, high = sample["expected_score_range"]
            results.append({"sample": sample["label"], "question": sample["question_id"],
                            "score": grade["score"], "expected_range": [low, high],
                            "passed": grade["score"] is not None and low <= grade["score"] <= high,
                            "criteria": grade["criteria"], "model": grade["model"],
                            "reference_count": len(grade["retrieved_chunks"])})
    print(json.dumps(results, ensure_ascii=False, indent=2))
    if not all(row["passed"] for row in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
