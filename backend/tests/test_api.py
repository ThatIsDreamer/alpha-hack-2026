from fastapi.testclient import TestClient
from backend import api
from backend.collectors.base import Item


def test_api_reads_persistence_and_bounds_demo(tmp_path, monkeypatch):
    monkeypatch.setenv('NEWS_DB', str(tmp_path / 'news.sqlite3'))
    monkeypatch.setenv('ENABLE_SCHEDULER', 'false')
    monkeypatch.delenv('AI_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    def fake_run(db, sources, client, classifier, limit, run_id):
        assert limit == 5 and classifier is None
        assert all(s['max_items'] == 5 for s in sources)
        db.insert('lenta', Item('test', 'https://example.com/story', 'Test story', 'Body'))
        return dict(discovered=1, fetched=0, classified=0, errors=0)
    monkeypatch.setattr(api, 'run', fake_run)
    with TestClient(api.app) as client:
        assert client.get('/health').status_code == 200
        assert client.post('/api/runs').status_code == 202
        assert client.post('/api/runs').status_code == 429
        assert client.get('/api/runs').json()[0]['status'] == 'completed'
        assert client.get('/api/news').json()['total'] == 1
        assert client.get('/api/news?source=other').json()['total'] == 0
        assert client.get('/api/news?limit=1000').status_code == 422
        assert client.get('/api/news/1').json()['text'] == 'Body'
        assert client.get('/api/news/999').status_code == 404
    with TestClient(api.app) as client:
        assert client.get('/api/overview').json()['total'] == 1
        assert client.post('/api/runs').status_code == 429


def test_overlapping_run_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setenv('NEWS_DB', str(tmp_path / 'news.sqlite3'))
    monkeypatch.setenv('ENABLE_SCHEDULER', 'false')
    with TestClient(api.app) as client:
        _, lock = api.reserve('scheduled')
        try:
            assert client.post('/api/runs').status_code == 409
        finally:
            lock.close()


def test_demo_classifies_when_credentials_exist(tmp_path, monkeypatch):
    monkeypatch.setenv('NEWS_DB', str(tmp_path / 'news.sqlite3'))
    monkeypatch.setenv('ENABLE_SCHEDULER', 'false')
    monkeypatch.setenv('AI_API_KEY', 'test-only')
    classifier = object()
    monkeypatch.setattr(api, 'create_classifier', lambda: classifier)
    def fake_run(db, sources, client, received_classifier, limit, run_id):
        assert received_classifier is classifier
        assert limit == 5
        return dict(discovered=0, fetched=0, classified=5, errors=0)
    monkeypatch.setattr(api, 'run', fake_run)
    with TestClient(api.app) as client:
        assert client.post('/api/runs').status_code == 202
        assert client.get('/api/runs').json()[0]['result']['classified'] == 5


def test_usage_and_source_metadata_are_exposed(tmp_path, monkeypatch):
    monkeypatch.setenv('NEWS_DB', str(tmp_path / 'usage.sqlite3'))
    monkeypatch.setenv('ENABLE_SCHEDULER', 'false')
    with TestClient(api.app) as client:
        db = api.database()
        db.insert('telegram-banksta', Item('1', 'https://t.me/banksta/1', 'News', 'Text'))
        run_id, lock = api.reserve('scheduled')
        lock.close()
        db.record_usage(1, run_id, 'test', {'prompt_tokens': 9, 'completion_tokens': 3, 'total_tokens': 12}, False)
        db.record_usage(1, run_id, 'test', None, True)
        db.conn.close()
        usage = client.get('/api/overview').json()['usage']
        assert usage['total_tokens'] == 12 and usage['unknown_requests'] == 1
        assert client.get('/api/runs').json()[0]['usage'] == usage
        item = client.get('/api/news').json()['items'][0]
        assert item['source_type'] == 'telegram' and item['source_channel'] == 'banksta'
        assert client.get('/api/news/1').json()['source_name'] == 'Банкста'


def test_restart_clears_stale_progress(tmp_path, monkeypatch):
    monkeypatch.setenv('NEWS_DB', str(tmp_path / 'restart.sqlite3'))
    monkeypatch.setenv('ENABLE_SCHEDULER', 'false')
    api.initialize()
    run_id, lock = api.reserve('scheduled')
    lock.close()
    db = api.database()
    db.insert('lenta', Item('1', 'https://test/1', 'Title', 'Text'))
    db.queue_items(run_id, [{'id': 1}])
    db.item_progress(run_id, 1, 'running')
    db.conn.close()
    with TestClient(api.app) as client:
        run = client.get('/api/runs').json()[0]
        assert run['status'] == 'interrupted'
        assert run['progress']['phase'] == 'interrupted'
        assert run['progress']['counts']['running'] == 0
        assert run['progress']['items'][0]['state'] == 'interrupted'
