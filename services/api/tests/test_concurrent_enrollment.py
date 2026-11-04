"""Concurrent real ASGI requests; not a production capacity benchmark."""
import concurrent.futures
import json
import statistics
import threading
import time

import pytest

from fastapi.testclient import TestClient
from test_mvp import ok, prepare
from app.main import app
from app.models import Assignment, User
from app.security import hasher


def test_thirty_students_enroll_concurrently(env):
    if env[1].kw["bind"].url.database in (None, "", ":memory:"):
        pytest.skip("Concurrent test requires a file SQLite or PostgreSQL TEST_DATABASE_URL")
    context = prepare(env, 1)
    password_hash = hasher.hash('load-test-password-123')
    with env[1]() as db:
        for index in range(30):
            student = User(username=f'load-{index}', name=f'Load {index}', role='STUDENT', password_hash=password_hash)
            db.add(student)
            db.flush()
            db.add(Assignment(exam_id=context['exam']['id'], student_id=student.id))
        db.commit()
    barrier = threading.Barrier(30)

    def run(index):
        with TestClient(app) as client:
            client.headers['X-Oral-Client'] = 'desktop'
            barrier.wait(timeout=30)
            begin = time.monotonic()
            ok(client.post('/auth/login', json={'username': f'load-{index}', 'password': 'load-test-password-123'}))
            ok(client.get('/exams/available'))
            session = ok(client.post('/exam-sessions', json={'exam_id': context['exam']['id']}))
            replay = ok(client.post('/exam-sessions', json={'exam_id': context['exam']['id']}))
            assert replay['id'] == session['id']
            ok(client.get(f"/exam-sessions/{session['id']}"))
            return (time.monotonic() - begin) * 1000

    with concurrent.futures.ThreadPoolExecutor(max_workers=30) as pool:
        elapsed = sorted(pool.map(run, range(30)))
    print('\nLOAD_REPORT=' + json.dumps({'clients': 30, 'successful': len(elapsed),
          'p50_flow_ms': round(statistics.median(elapsed), 2), 'p95_flow_ms': round(elapsed[28], 2),
          'scope': 'ASGI login/list/create/replay/read; no socket, audio uploads or AI grading'}))
