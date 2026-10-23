import gzip
import json

from fastapi.testclient import TestClient
from backend import api, businesses, recommendations as rec
from backend.tests.test_businesses import dataset  # noqa: F401
from backend.tests.test_recommendations import onboard, seed_news, output, HEADERS


def answers(version=0, **overrides):
    return dict(version=version, description='Поставляем зерно', counterparties='', geography='',
                priorities='Закупка оборудования') | overrides


def test_backfill_confirmation_isolation_validation_and_conflict(dataset):
    with TestClient(api.app) as client:
        with businesses.connection() as conn:
            assert conn.execute('SELECT count(*) FROM business_context').fetchone()[0] == 3
        url = '/api/businesses/U_26030/context'
        initial = client.get(url).json()
        assert initial['status'] == 'draft' and initial['version'] == 0
        assert initial['facts']['industry_code'] == '41.2'
        assert initial['facts_provenance']['source'] == 'synthetic_dataset'
        assert not any(initial['answers'].values()) and not initial['answer_provenance']
        saved = client.post(url, json=answers(description='  Поставляем зерно  ')).json()
        assert saved['status'] == 'confirmed' and saved['version'] == 1
        assert saved['answers']['description'] == 'Поставляем зерно'
        assert saved['answer_provenance']['description']['source'] == 'user'
        assert 'geography' not in saved['answer_provenance']
        assert client.post(url, json=answers()).status_code == 409
        for invalid in (answers(version=True), answers(description=42), answers(priorities='x' * 1001), answers(extra='bad')):
            assert client.post(url, json=invalid).status_code == 422
        assert client.get(url).json() == saved
        assert client.get('/api/businesses/U_2/context').json()['status'] == 'draft'
        assert client.get('/api/businesses/missing/context').status_code == 404
        assert client.post('/api/businesses/missing/context', json=answers()).status_code == 404
    with TestClient(api.app) as client:
        assert client.get(url).json() == saved


def test_context_survives_seed_replacement_and_old_db_migration(dataset):
    seed, original = dataset
    with TestClient(api.app) as client:
        saved = client.post('/api/businesses/U_26030/context', json=answers()).json()
    with gzip.open(seed / businesses.FILES[2], 'at', encoding='utf-8') as file:
        file.write('F2;U_2;Москва;МОСКОВСКИЙ\n')
    original(businesses.db_path(), seed)
    current = businesses.get_context('U_26030')
    assert current['answers'] == saved['answers'] and current['version'] == saved['version']
    assert current['confirmed_at'] == saved['confirmed_at']
    assert current['facts_provenance']['version'] != saved['facts_provenance']['version']
    with businesses.connection(write=True) as conn, conn:
        conn.execute('DROP TABLE business_context')
    businesses.import_dataset(businesses.db_path())
    assert businesses.get_context('U_26030')['status'] == 'draft'


def test_context_passed_to_model_snapshot_and_cache_invalidation(dataset, monkeypatch):
    monkeypatch.setenv('AI_API_KEY', 'test')
    calls = []
    def generate(payload):
        calls.append(payload)
        return rec.validate_output(output(), payload)
    monkeypatch.setattr(rec, 'generate', generate)
    with TestClient(api.app) as client:
        onboard(client)
        seed_news()
        url = '/api/businesses/U_26030/context'
        client.post(url, json=answers())
        first = client.post('/api/recommendations', headers=HEADERS).json()['result']
        assert calls[0]['business']['context']['answers']['description'] == 'Поставляем зерно'
        assert first['context_version'] == 1
        assert first['context_snapshot']['answers']['priorities'] == 'Закупка оборудования'
        assert client.post('/api/recommendations', headers=HEADERS).json()['result'] == first
        assert len(calls) == 1
        refreshed = client.post('/api/recommendations?refresh=true', headers=HEADERS).json()['result']
        assert len(calls) == 2 and refreshed['context_version'] == 1
        assert refreshed['context_snapshot'] == first['context_snapshot']
        client.post(url, json=answers(version=1, priorities='Экспорт продукции'))
        assert client.get('/api/recommendations', headers=HEADERS).json()['result'] is None
        second = client.post('/api/recommendations', headers=HEADERS).json()['result']
        assert second['context_version'] == 2 and len(calls) == 3
        assert first['context_snapshot']['answers']['priorities'] == 'Закупка оборудования'
        db = api.database()
        snapshots = [json.loads(row[0])['context_version'] for row in db.conn.execute('SELECT result FROM recommendation_cache')]
        assert sorted(snapshots) == [1, 2]
        db.conn.close()


def test_confirmed_context_changes_news_ranking():
    stories = [{'id': 1, 'title': 'Поставки зерна', 'text': 'Зерновой рынок'},
               {'id': 2, 'title': 'Оборудование для пекарни', 'text': 'Новая печь'}]
    business = {'industry': 'Торговля', 'context': {
        'status': 'confirmed', 'answers': {'priorities': 'Оборудование пекарни'}}}
    assert rec.rank_articles(stories, business, {'sectors': []})[0]['id'] == 2
    business['context']['status'] = 'draft'
    assert rec.rank_articles(stories, business, {'sectors': []})[0]['id'] == 1
