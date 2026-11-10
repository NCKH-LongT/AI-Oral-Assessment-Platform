"""Server acknowledgement recovery: replay identical payloads after a lost response."""
from sqlalchemy import func, select
from test_mvp import ok, prepare, start, upload
from app.models import Upload


def test_replay_submit_and_complete_after_lost_acknowledgement(env):
    context = prepare(env, 1)
    client = env[0]['student']
    session = start(env, context)
    attempt_id = session['current_attempt']['id']
    ok(client.post(f'/question-attempts/{attempt_id}/start'))
    payload = {'transcript': 'Dependency injection supplies dependencies externally.', 'stt_confidence': 0.9}
    headers = {'Idempotency-Key': 'network-recovery-stable-key'}
    # Ignore the first acknowledgement, as if the connection dropped after commit.
    ok(client.post(f'/question-attempts/{attempt_id}/submit', json=payload, headers=headers))
    ok(client.post(f'/question-attempts/{attempt_id}/submit', json=payload, headers=headers))
    row, blob = upload(client, attempt_id, 'AUDIO')
    ok(client.post(f"/uploads/{row['id']}/complete"))
    with env[1]() as db:
        assert db.scalar(select(func.count()).select_from(Upload).where(Upload.attempt_id == attempt_id)) == 1
    # A retry with changed answer must never replace the accepted answer.
    assert client.post(f'/question-attempts/{attempt_id}/submit', json=payload | {'transcript': 'Changed'}, headers=headers).status_code == 409
