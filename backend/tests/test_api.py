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
        assert client.get('/api/news').json()['total'] == 0
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
        db.classified(1, {'topic': 'business', 'severity': 'none'}, 'test', '1')
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


def test_inbox_only_lists_classified_items_with_correct_pagination(tmp_path, monkeypatch):
    monkeypatch.setenv('NEWS_DB', str(tmp_path / 'inbox.sqlite3'))
    monkeypatch.setenv('ENABLE_SCHEDULER', 'false')
    with TestClient(api.app) as client:
        db = api.database()
        for i, source in enumerate(['lenta', 'rbc', 'lenta', 'rbc'], 1):
            db.insert(source, Item(str(i), f'https://test/{i}', str(i), 'Text'))
        for i in (1, 2, 3):
            db.classified(i, {'topic': 'business', 'severity': 'none'}, 'test', '1')
        with db.conn:
            db.conn.execute("UPDATE news SET classified_at='2026-01-01' WHERE id IN (2,3)")
        db.conn.close()
        page = client.get('/api/news?limit=2').json()
        assert page['total'] == 3
        assert [i['id'] for i in page['items']] == [1, 3]
        assert [i['id'] for i in client.get('/api/news?limit=2&offset=2').json()['items']] == [2]
        filtered = client.get('/api/news?source=rbc').json()
        assert filtered['total'] == 1 and filtered['items'][0]['id'] == 2


def test_topic_risk_and_source_filters_combine(tmp_path, monkeypatch):
    monkeypatch.setenv('NEWS_DB', str(tmp_path / 'filters.sqlite3'))
    monkeypatch.setenv('ENABLE_SCHEDULER', 'false')
    with TestClient(api.app) as client:
        db = api.database()
        for i, (source, topic, severity) in enumerate([
            ('lenta','business','high'), ('rbc','business','high'),
            ('lenta','business','none'), ('lenta','politics','high'),
            ('lenta','business','high')], 1):
            db.insert(source, Item(str(i), f'https://test/{i}', str(i), 'Text'))
            if i != 5:
                db.classified(i, {'topic':topic, 'severity':severity}, 'test', '1')
        db.conn.close()
        assert client.get('/api/news?topic=business').json()['total'] == 3
        assert client.get('/api/news?severity=high').json()['total'] == 3
        both = client.get('/api/news?topic=business&severity=high&source=lenta').json()
        assert both['total'] == 1 and both['items'][0]['id'] == 1
        assert client.get('/api/news?topic=business&severity=high&limit=1&offset=1').json()['items'][0]['id'] == 1
        assert client.get('/api/news?topic=sports&severity=high').json()['total'] == 0
        assert client.get('/api/news?topic=invalid').status_code == 422
        assert client.get('/api/news?severity=invalid').status_code == 422
