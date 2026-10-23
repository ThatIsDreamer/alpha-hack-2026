import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from backend import api, businesses, recommendations as rec
from backend.business_topics import news_topics, migrate_categories, VERSION
from backend.collectors.base import Item
from backend.tests.test_businesses import dataset  # noqa: F401

HEADERS = {'X-Business-ID': 'U_26030'}


def seed_news():
    db = api.database()
    for source, topic, risk, published in [
        ('lenta', 'business', 'high', None), ('lenta', 'technology', 'low', None),
        ('kommersant', 'business', 'high', None), ('lenta', 'business', 'high', '2020-01-01'),
    ]:
        index = db.conn.execute('SELECT count(*) FROM news').fetchone()[0] + 1
        db.insert(source, Item(str(index), f'https://example.com/{index}', f'Новость {index}', 'Текст новости о бизнесе', published))
        db.classified(index, {'topic': topic, 'severity': risk}, 'test', '1')
    db.conn.close()


def onboard(client, company='U_26030'):
    assert client.post(f'/api/businesses/{company}/onboarding', json={'source_ids': ['lenta']}).status_code == 200


def output(news_id=1):
    return rec.Output(status='ready', recommendations=[rec.Action(
        title='Проверить актуальные условия', rationale='Новость даёт повод проверить условия ведения бизнеса.',
        action='Откройте сервис и изучите данные до принятия решения.', relevance='Связано с отраслью компании и её контрагентов.',
        service_id=service, news_ids=[news_id]) for service in ['counterparty_check','financial_analytics','deposits']])


def test_categories_persist_and_cover_counterparties(dataset):
    with TestClient(api.app) as client:
        onboard(client)
        with businesses.connection(write=True) as conn, conn:
            conn.execute("UPDATE businesses SET industry_code='62.01',industry='Разработка ПО' WHERE id='U_2'")
            conn.execute("DELETE FROM business_categories WHERE business_id='U_2'")
            migrate_categories(conn)
            assert conn.execute('SELECT count(*) FROM business_categories WHERE mapping_version=?', (VERSION,)).fetchone()[0] == 3
        data = client.get('/api/recommendations', headers=HEADERS).json()
        assert data['business']['news_topics'] == ['business','economy','law']
        assert 'technology' in data['topics']
        assert data['counterparties']['known_companies'] == 2
        assert data['counterparties']['unknown_companies'] == 1
        assert data['counterparties']['known_turnover_share'] == pytest.approx(70/150)
        assert set(news_topics('86.1')) == {'business','economy','law','health'}
        assert news_topics('') == ['other']


def test_filters_preferences_dates_and_company_isolation(dataset, monkeypatch):
    monkeypatch.delenv('AI_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    with TestClient(api.app) as client:
        assert client.get('/api/recommendations').status_code == 422
        assert client.get('/api/recommendations', headers={'X-Business-ID':'bad'}).status_code == 404
        assert client.get('/api/recommendations', headers=HEADERS).status_code == 409
        onboard(client)
        seed_news()
        data = client.get('/api/recommendations', headers=HEADERS).json()
        assert data['candidate_count'] == 1  # Excludes unselected, old and unrelated topic.
        assert client.get('/api/recommendations?severity=low', headers=HEADERS).json()['candidate_count'] == 0
        assert client.get('/api/recommendations?topic=technology', headers=HEADERS).json()['candidate_count'] == 0
        for query in ['source=kommersant','topic=bad','severity=bad']:
            assert client.get('/api/recommendations?'+query, headers=HEADERS).status_code == 422
        assert client.get('/api/recommendations', headers={'X-Business-ID':'U_3'}).status_code == 409
        assert client.post('/api/recommendations', headers=HEADERS).status_code == 503
        assert client.post('/api/recommendations?severity=low', headers=HEADERS).json()['result']['status'] == 'insufficient_evidence'


def test_validated_sources_cache_and_preference_invalidation(dataset, monkeypatch):
    monkeypatch.setenv('AI_API_KEY', 'test')
    calls = []
    def fake(payload):
        calls.append(payload)
        return rec.validate_output(output(), payload)
    monkeypatch.setattr(rec, 'generate', fake)
    with TestClient(api.app) as client:
        onboard(client)
        seed_news()
        first = client.post('/api/recommendations', headers=HEADERS).json()
        assert len(first['result']['recommendations']) == 3
        action = first['result']['recommendations'][0]
        assert action['sources'][0]['url'] == 'https://example.com/1'
        assert action['service']['url'].startswith('https://alfabank.ru/')
        assert 'text' not in action['sources'][0]
        assert client.post('/api/recommendations', headers=HEADERS).json()['result'] == first['result']
        assert len(calls) == 1
        client.post('/api/businesses/U_26030/onboarding', json={'source_ids':['kommersant']})
        assert client.get('/api/recommendations', headers=HEADERS).json()['result'] is None
        onboard(client, 'U_3')
        assert client.get('/api/recommendations', headers={'X-Business-ID':'U_3'}).json()['result'] is None


@pytest.mark.parametrize('mutation', ['unknown_news', 'unknown_service', 'duplicate_service', 'wrong_count', 'foreign_trade'])
def test_rejects_unsupported_results(mutation):
    value = output()
    payload = {'news':[{'id':1,'title':'Test','url':'https://example.com','text':'Body'}], 'business': {'foreign_trade': False}}
    if mutation == 'unknown_news': value.recommendations[0].news_ids = [999]
    if mutation == 'unknown_service': value.recommendations[0].service_id = 'invented'
    if mutation == 'duplicate_service': value.recommendations[1].service_id = value.recommendations[0].service_id
    if mutation == 'wrong_count': value.recommendations.pop()
    if mutation == 'foreign_trade': value.recommendations[0].service_id = 'currency_control'
    with pytest.raises(ValueError): rec.validate_output(value, payload)


def test_model_usage_recorded_even_for_invalid_result(dataset, monkeypatch):
    monkeypatch.setenv('AI_API_KEY','test')
    monkeypatch.setenv('AI_MODEL','deepseek/deepseek-v4.1-flash')
    def completion(**kwargs):
        assert kwargs['max_completion_tokens'] == 2200
        assert 'services' in kwargs['messages'][0]['content']
        return SimpleNamespace(usage=SimpleNamespace(prompt_tokens=120,completion_tokens=30,total_tokens=150), choices=[
            SimpleNamespace(finish_reason='stop',message=SimpleNamespace(refusal=None,content=output(999).model_dump_json()))])
    monkeypatch.setattr(rec, 'OpenAI', lambda **kwargs: SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=completion)),close=lambda:None))
    with TestClient(api.app) as client:
        onboard(client)
        seed_news()
        assert client.post('/api/recommendations', headers=HEADERS).status_code == 502
        assert client.post('/api/recommendations', headers=HEADERS).status_code == 429
        db = api.database()
        assert db.usage()['total_tokens'] == 150
        row = db.conn.execute("SELECT * FROM ai_usage WHERE purpose='recommendation'").fetchone()
        assert row['business_id'] == 'U_26030' and row['failed'] == 1
        assert db.conn.execute('SELECT count(*) FROM recommendation_cache').fetchone()[0] == 0
        db.conn.close()


def test_generation_lock_is_released(dataset, monkeypatch):
    monkeypatch.setenv('AI_API_KEY','test')
    with TestClient(api.app) as client:
        onboard(client)
        seed_news()
        rec.GATE.acquire()
        try: assert client.post('/api/recommendations', headers=HEADERS).status_code == 429
        finally: rec.GATE.release()
        monkeypatch.setattr(rec,'generate',lambda payload: (_ for _ in ()).throw(ValueError('bad')))
        assert client.post('/api/recommendations', headers=HEADERS).status_code == 502
        assert not rec.GATE.locked()


def test_industry_ranking_prefers_specific_evidence():
    stories = [{'id':1,'title':'Новости знаменитостей','text':'Рассказ о вечеринке'},
               {'id':2,'title':'Поставки зерна на экспорт','text':'Зерновой рынок и экспортные контракты'},
               {'id':3,'title':'Изменение ключевой ставки','text':'Кредит и инфляция'}]
    ranked = rec.rank_articles(stories, {'industry':'Торговля оптовая зерном'}, {'sectors':[]})
    assert ranked[0]['id'] == 2 and ranked[-1]['id'] == 1
