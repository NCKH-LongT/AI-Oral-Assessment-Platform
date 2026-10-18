from sqlalchemy import select
from test_mvp import ok
from test_storage_management import completed

from app import media_retention, storage, worker
from app.models import Attempt, ExamSession, MediaCleanup, ProcessingJob, ReviewJob, Upload


def test_new_submission_cleans_only_older_media_and_keeps_scores(env):
    context, old, evidence, blob = completed(env)
    clients, factory = env
    with factory() as db:
        original = db.get(ExamSession, old["id"])
        latest = ExamSession(exam_id=original.exam_id, student_id=original.student_id,
            attempt_number=2, status="IN_PROGRESS")
        db.add(latest)
        db.commit()
        newest_id = latest.id
    assert not media_retention.tick(factory)  # An unfinished retake cannot erase evidence.
    with factory() as db:
        db.get(ExamSession, newest_id).status = "SUBMITTED"
        db.commit()
    assert media_retention.tick(factory)
    assert not media_retention.tick(factory)
    with factory() as db:
        assert db.get(ExamSession, old["id"]).final_score == 8
        assert db.get(ExamSession, old["id"]).deleted_at is None
        assert db.get(ExamSession, newest_id).media_removed_at is None
        assert db.scalar(select(Attempt).where(Attempt.session_id == old["id"])).transcript == "Original answer"
        assert db.get(Upload, evidence["id"]) is None
        assert db.scalar(select(MediaCleanup)).storage_key == f"evidence/{evidence['id']}"
    assert storage.get(f"evidence/{evidence['id']}") == blob
    assert worker.tick()  # Physical deletion is retryable and happens after commit.
    assert not storage.local_path(f"evidence/{evidence['id']}").exists()


def test_retention_waits_for_reviews_and_server_jobs(env):
    context, old, evidence, _ = completed(env)
    clients, factory = env
    with factory() as db:
        original = db.get(ExamSession, old["id"])
        aid = db.scalar(select(Attempt.id).where(Attempt.session_id == old["id"]))
        db.add(ExamSession(exam_id=original.exam_id, student_id=original.student_id,
                          attempt_number=2, status="COMPLETED"))
        job = ProcessingJob(attempt_id=aid, status="QUEUED_STT", policy={"provider": "local_server"})
        db.add(job)
        db.commit()
        jid = job.id
    assert not media_retention.tick(factory)
    with factory() as db:
        db.get(ProcessingJob, jid).status = "COMPLETED"
        review = ReviewJob(attempt_id=aid, requested_by=ok(clients["admin"].get("/auth/me"))["id"],
                          reason="Review original audio", policy={"provider": "google"}, original={})
        db.add(review)
        db.commit()
        rid = review.id
    assert not media_retention.tick(factory)
    with factory() as db:
        assert db.get(Upload, evidence["id"])
        db.get(ReviewJob, rid).status = "COMPLETED"
        db.commit()
    assert media_retention.tick(factory)


def test_retention_skips_locked_recordings(env):
    import pytest
    with env[1]() as db:
        if db.bind.dialect.name != "postgresql":
            pytest.skip("PostgreSQL row locks required")
    _, old, evidence, _ = completed(env)
    factory = env[1]
    with factory() as db:
        original = db.get(ExamSession, old["id"])
        db.add(ExamSession(exam_id=original.exam_id, student_id=original.student_id,
                          attempt_number=2, status="SUBMITTED"))
        db.commit()
    with factory() as locked:
        locked.scalar(select(Upload).where(Upload.id == evidence["id"]).with_for_update())
        assert not media_retention.tick(factory)
        assert locked.get(Upload, evidence["id"])
    assert media_retention.tick(factory)
