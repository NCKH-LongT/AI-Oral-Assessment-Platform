import time

import engine
import pytest


def test_timeout_kills_process_group_and_uses_public_timeout_error(tmp_path, monkeypatch):
    events = []

    class Process:
        pid = 42

        def wait(self, timeout=None):
            events.append("wait")
            if timeout is not None:
                raise engine.subprocess.TimeoutExpired("kaldi", timeout)
            return -9

    def start(command, **kwargs):
        assert kwargs["start_new_session"] is True
        return Process()

    monkeypatch.setattr(engine.subprocess, "Popen", start)
    monkeypatch.setattr(engine.signal, "SIGKILL", 9, raising=False)
    monkeypatch.setattr(engine.os, "killpg", lambda pid, signal: events.append((pid, signal)), raising=False)
    with pytest.raises(TimeoutError, match="deadline exceeded"):
        engine.run(["kaldi"], tmp_path, time.monotonic() + 1)
    assert events == ["wait", (42, 9), "wait"]
