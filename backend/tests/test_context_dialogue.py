import gzip
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from backend import api, businesses, context_dialogue as dialogue
from backend.tests.test_businesses import dataset  # noqa: F401

BASE = '/api/businesses/U_26030/context/dialogue'


@pytest.fixture
def model(monkeypatch):
    monkeypatch.setenv('AI_API_KEY', 'test')
    monkeypatch.setattr(dialogue.time, 'time', lambda: 10000)
    def extract(profile, state, field):
        answer = state['messages'][-1]
        return dialogue.Extraction(value=answer['text'], evidence=[dialogue.Evidence(
            message_id=answer['id'], quote=answer['text'])], clarification='')
    monkeypatch.setattr(dialogue, 'extract', extract)
    return extract


def turn(client, session, answer='Ответ о бизнесе', skip=False, base=BASE):
    return client.post(base + '/answer', json={
        'dialogue_id': session['id'], 'revision': session['revision'], 'answer': answer, 'skip': skip})


def release_cooldown(session_id):
    with businesses.connection(write=True) as conn, conn:
        row = conn.execute('SELECT state FROM context_dialogues WHERE id=?', (session_id,)).fetchone()
        state = json.loads(row[0]); state['last_attempt'] = 0
        conn.execute('UPDATE context_dialogues SET state=? WHERE id=?', (json.dumps(state), session_id))


def test_resume_isolation_and_explicit_confirmation(dataset, model):
    with TestClient(api.app) as client:
        assert client.get(BASE).json()['session'] is None
        session = client.post(BASE + '/start').json()
        assert client.post(BASE + '/start').json()['id'] == session['id']
        assert session['pending'] == list(dialogue.FIELDS)
        for key in dialogue.FIELDS:
            release_cooldown(session['id'])
            session = turn(client, session, f'Факты о компании: {key}').json()
        assert session['ready'] and session['turns'] == 4
        assert businesses.get_context('U_26030')['status'] == 'draft'
        assert turn(client, session).status_code == 409
        assert client.get('/api/businesses/U_2/context/dialogue').json()['session'] is None
        saved = client.post('/api/businesses/U_26030/context', json={
            'version': 0, **session['draft'], 'dialogue_id': session['id']}).json()
        assert saved['version'] == 1 and saved['status'] == 'confirmed'
        assert saved['answer_provenance']['description']['source'] == 'user_confirmed_ai'
        assert saved['answer_provenance']['description']['evidence'][0]['quote'] == 'Факты о компании: description'
        assert client.get(BASE).json()['session'] is None
    with TestClient(api.app):
        assert businesses.get_context('U_26030')['answer_provenance']['description']['dialogue_id'] == session['id']


def test_session_and_evidence_survive_reseed(dataset, model):
    seed, original = dataset
    with TestClient(api.app) as client:
        session = client.post(BASE + '/start').json()
        session = turn(client, session).json()
    with gzip.open(seed / businesses.FILES[2], 'at', encoding='utf-8') as file:
        file.write('F2;U_2;Москва;МОСКОВСКИЙ\n')
    original(businesses.db_path(), seed)
    with TestClient(api.app) as client:
        assert client.get(BASE).json()['session'] == session
        assert businesses.get_context('U_26030')['status'] == 'draft'


def test_skip_no_model_and_limit_clarifications(dataset, model, monkeypatch):
    calls = []
    def clarify(profile, state, field):
        calls.append(field)
        result = model(profile, state, field)
        result.clarification = 'Можете уточнить этот ответ?'
        return result
    monkeypatch.setattr(dialogue, 'extract', clarify)
    with TestClient(api.app) as client:
        session = client.post(BASE + '/start').json()
        for _ in range(6):
            release_cooldown(session['id'])
            session = turn(client, session).json()
        assert session['ready'] and session['turns'] == 6 and session['clarifications'] == 2
        assert len(calls) == 6
        other = '/api/businesses/U_2/context/dialogue'
        session = client.post(other + '/start').json()
        for _ in range(4):
            session = turn(client, session, skip=True, base=other).json()
        assert session['ready'] and not any(session['draft'].values()) and len(calls) == 6


@pytest.mark.parametrize('failure', ['unknown_id', 'wrong_quote', 'wrong_field', 'no_evidence', 'too_long', 'provider'])
def test_invalid_model_result_preserves_draft_and_history(dataset, model, monkeypatch, failure):
    def broken(profile, state, field):
        value = model(profile, state, field)
        if failure == 'unknown_id': value.evidence[0].message_id = 999
        if failure == 'wrong_quote': value.evidence[0].quote = 'Выдуманная цитата'
        if failure == 'wrong_field': value.evidence[0].message_id = 1
        if failure == 'no_evidence': value.evidence = []
        if failure == 'too_long': value.value = 'x' * 1501
        if failure == 'provider': raise RuntimeError('private provider error')
        return value
    monkeypatch.setattr(dialogue, 'extract', broken)
    with TestClient(api.app) as client:
        session = client.post(BASE + '/start').json()
        response = turn(client, session)
        assert response.status_code == 502 and 'private provider' not in response.text
        current = client.get(BASE).json()['session']
        assert current['revision'] == 0 and current['messages'] == session['messages']
        assert current['draft'] == session['draft'] and not dialogue.GATE.locked()
        assert turn(client, session).status_code == 429


def test_version_conflicts_missing_ai_validation_and_early_confirmation(dataset, monkeypatch):
    monkeypatch.delenv('AI_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    with TestClient(api.app) as client:
        session = client.post(BASE + '/start').json()
        assert not session['ai_available'] and turn(client, session).status_code == 503
        assert turn(client, session, answer=' ').status_code == 422
        assert client.post('/api/businesses/U_26030/context', json={
            'version': 0, **session['draft'], 'dialogue_id': session['id']}).status_code == 409
        assert turn(client, session, base='/api/businesses/U_2/context/dialogue').status_code == 409
        assert client.post('/api/businesses/U_26030/context', json={'version': 0, **session['draft']}).status_code == 200
        assert turn(client, session, skip=True).status_code == 409
        assert client.post('/api/businesses/missing/context/dialogue/start').status_code == 404


def test_usage_recorded_when_provider_result_invalid(dataset, monkeypatch):
    monkeypatch.setenv('AI_API_KEY', 'test')
    calls = []
    def complete(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(usage=SimpleNamespace(prompt_tokens=50, completion_tokens=10, total_tokens=60),
            choices=[SimpleNamespace(finish_reason='length', message=SimpleNamespace(refusal=None, content='{}'))])
    monkeypatch.setattr(dialogue, 'OpenAI', lambda **kwargs: SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=complete)), close=lambda: None))
    with TestClient(api.app) as client:
        session = client.post(BASE + '/start').json()
        assert turn(client, session).status_code == 502
        assert calls[0]['response_format']['json_schema']['strict'] is True
        db = api.database()
        row = db.conn.execute("SELECT * FROM ai_usage WHERE purpose='company_context'").fetchone()
        assert row['business_id'] == 'U_26030' and row['failed'] == 1 and row['total_tokens'] == 60
        db.conn.close()


def test_structured_model_success_and_user_edits_provenance(dataset, monkeypatch):
    monkeypatch.setenv('AI_API_KEY', 'test')
    def complete(**kwargs):
        payload = json.loads(kwargs['messages'][1]['content'])
        message = payload['messages'][-1]
        result = dialogue.Extraction(value=message['text'], evidence=[dialogue.Evidence(
            message_id=message['id'], quote=message['text'])], clarification='')
        return SimpleNamespace(usage=None, choices=[SimpleNamespace(finish_reason='stop',
            message=SimpleNamespace(refusal=None, content=result.model_dump_json()))])
    monkeypatch.setattr(dialogue, 'OpenAI', lambda **kwargs: SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=complete)), close=lambda: None))
    with TestClient(api.app) as client:
        initial = client.post(BASE + '/start').json()
        session = turn(client, initial, answer='Поставляем дизель').json()
        assert session['draft']['description'] == 'Поставляем дизель'
        assert turn(client, initial, skip=True).status_code == 409
        for _ in range(3):
            session = turn(client, session, skip=True).json()
        assert session['ready']
        saved = client.post('/api/businesses/U_26030/context', json={
            'version': 0, **session['draft'], 'description': 'Уточнено пользователем',
            'dialogue_id': session['id']}).json()
        assert saved['answer_provenance']['description']['source'] == 'user'
        db = api.database()
        assert db.conn.execute("SELECT failed FROM ai_usage WHERE purpose='company_context'").fetchone()[0] == 0
        db.conn.close()


def test_lock_and_context_edit_during_generation(dataset, model, monkeypatch):
    with TestClient(api.app) as client:
        session = client.post(BASE + '/start').json()
        dialogue.GATE.acquire()
        try:
            assert turn(client, session).status_code == 429
        finally:
            dialogue.GATE.release()
        def concurrent(profile, state, field):
            client.post('/api/businesses/U_26030/context', json={'version': 0, **profile['answers']})
            return model(profile, state, field)
        monkeypatch.setattr(dialogue, 'extract', concurrent)
        assert turn(client, session).status_code == 409
        with businesses.connection() as conn:
            assert conn.execute('SELECT revision FROM context_dialogues WHERE id=?', (session['id'],)).fetchone()[0] == 0
