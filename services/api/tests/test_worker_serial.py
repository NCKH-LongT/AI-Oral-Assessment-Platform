from contextlib import contextmanager
from threading import Event, Thread
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app import worker


def test_worker_thread_is_serial_and_releases_on_error(env, monkeypatch):
    entered, release = Event(), Event()

    def process():
        entered.set()
        assert release.wait(5)
        return True

    monkeypatch.setattr(worker, "process_next", process)
    running = Thread(target=worker.tick)
    running.start()
    try:
        assert entered.wait(5)
        assert worker.tick() is False
    finally:
        release.set()
        running.join(5)
    assert not running.is_alive()

    def broken():
        raise RuntimeError("interrupted")

    monkeypatch.setattr(worker, "process_next", broken)
    with pytest.raises(RuntimeError):
        worker.tick()
    monkeypatch.setattr(worker, "process_next", lambda: True)
    assert worker.tick()


@pytest.mark.parametrize("acquired", [True, False])
def test_postgres_lock_covers_entire_processing_tick(env, monkeypatch, acquired):
    events = []

    @contextmanager
    def lock_session():
        events.append("open")

        def lock(statement):
            assert "pg_try_advisory_xact_lock" in str(statement)
            events.append("lock")
            return acquired

        try:
            yield SimpleNamespace(get_bind=lambda: SimpleNamespace(dialect=SimpleNamespace(name="postgresql")),
                                  scalar=lock)
        finally:
            events.append("release")

    monkeypatch.setattr(worker, "SessionLocal", lock_session)
    monkeypatch.setattr(worker, "process_next", lambda: events.append("work") or True)
    assert worker.tick() == acquired
    assert events == (["open", "lock", "work", "release"] if acquired else ["open", "lock", "release"])


def test_external_postgres_worker_excludes_local_worker(env, monkeypatch):
    with env[1]() as external:
        if external.get_bind().dialect.name != "postgresql":
            pytest.skip("Requires PostgreSQL")
        external.execute(text("SELECT pg_advisory_xact_lock(72627620)"))
        calls = []
        monkeypatch.setattr(worker, "process_next", lambda: calls.append("work") or True)
        assert worker.tick() is False
        assert calls == []
    assert worker.tick() is True
    assert calls == ["work"]
