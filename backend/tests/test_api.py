from fastapi.testclient import TestClient
from backend import api
from backend.collectors.base import Item


def test_api_reads_persistence_and_bounds_demo(tmp_path, monkeypatch):
    monkeypatch.setenv('NEWS_DB', str(tmp_path / 'news.sqlite3'))
    monkeypatch.setenv('ENABLE_SCHEDULER', 'false')
    def fake_run(db, sources, client, classifier, limit):
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
