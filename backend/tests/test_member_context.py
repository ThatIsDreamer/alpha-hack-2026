import json
import sqlite3

import pytest
from fastapi.testclient import TestClient
from backend import api, businesses, context_dialogue as dialogue, recommendations, member_context
from backend.tests.test_businesses import dataset  # noqa: F401

BASE = '/api/businesses/U_26030'
ONE = {'X-Demo-User-ID': 'member-1'}
TWO = {'X-Demo-User-ID': 'member-2'}
THREE = {'X-Demo-User-ID': 'member-3'}


def role(client, headers, selected='cfo', base=BASE):
    own = client.get(base + '/member-context', headers=headers).json()['member']
    return client.post(base + '/member-context/role', headers=headers, json={'role': selected, 'version': own['version']})


@pytest.fixture
def model(monkeypatch):
    monkeypatch.setenv('AI_API_KEY', 'test')
    monkeypatch.setattr(dialogue, 'choose_first_question', lambda profile, state: dialogue.Question(
        field='personal_tasks', question=f"Какие задачи важны для вас как {profile['member']['role_label']}?"))
    def extract(profile, state, field):
        message = state['messages'][-1]
        quote = [dialogue.Evidence(message_id=message['id'], quote=message['text'])]
        return dialogue.AdaptiveTurn(updates=[
            dialogue.ContextUpdate(field='description', value='Новое общее описание', evidence=quote),
            dialogue.ContextUpdate(field='personal_tasks', value=message['text'], evidence=quote),
            dialogue.ContextUpdate(field='personal_focus', value='Короткие объяснения валютных рисков', evidence=quote),
        ], next_field='done', next_question='')
    monkeypatch.setattr(dialogue, 'extract', extract)


def completed(client, headers, text='Мои личные задачи: планирование бюджета'):
    session = client.post(BASE + '/context/dialogue/start', headers=headers).json()
    response = client.post(BASE + '/context/dialogue/answer', headers=headers, json={
        'dialogue_id': session['id'], 'revision': session['revision'], 'answer': text})
    assert response.status_code == 200, response.text
    return response.json()


def confirm(client, headers, session):
    return client.post(BASE + '/member-context/confirm', headers=headers, json={
        'dialogue_id': session['id'], 'revision': session['revision']})


def test_role_first_and_member_profile_isolation(dataset, model):
    with TestClient(api.app) as client:
        assert client.options(BASE + '/member-context', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-demo-user-id'}).status_code == 200
        assert client.get(BASE + '/member-context').status_code == 422
        assert client.get(BASE + '/member-context', headers={'X-Demo-User-ID': 'outsider'}).status_code == 403
        assert client.post(BASE + '/context/dialogue/start', headers=TWO).status_code == 409
        assert client.post(BASE + '/member-context/welcome', headers=TWO).status_code == 409
        assert role(client, TWO).status_code == 200
        assert client.post(BASE + '/member-context/role', headers=TWO, json={'role': ['cfo', 'ceo'], 'version': 1}).status_code == 422
        assert client.post(BASE + '/member-context/welcome', headers=TWO).status_code == 200
        assert not client.get(BASE + '/member-context', headers=ONE).json()['member']['welcome_seen']
        session = completed(client, TWO)
        assert client.get(BASE + '/context/dialogue', headers=TWO).json()['session']['id'] == session['id']
        assert client.get(BASE + '/context/dialogue', headers=THREE).json()['session'] is None
        assert client.get(BASE + '/context/dialogue').json()['session'] is None
        assert confirm(client, THREE, session).status_code == 409
        assert client.post(BASE + '/context/dialogue/revise', headers=THREE, json={
            'dialogue_id': session['id'], 'revision': session['revision'], 'field': 'personal_tasks'}).status_code == 409
        saved = confirm(client, TWO, session)
        assert saved.status_code == 200
        assert saved.json()['member']['confirmed']
        assert confirm(client, TWO, session).status_code == 409
        other = client.get(BASE + '/member-context', headers=THREE).json()
        assert other['member']['answers']['personal_tasks'] == ''
        assert 'планирование бюджета' not in json.dumps(other, ensure_ascii=False)
        assert businesses.get_context('U_26030')['version'] == 0
        assert client.get('/api/businesses/U_2/member-context', headers=TWO).json()['member']['role'] is None


def test_shared_changes_need_responsible_and_never_include_personal_answers(dataset, model):
    with TestClient(api.app) as client:
        role(client, TWO)
        session = completed(client, TWO, 'Личная секретная задача сотрудника 2')
        saved = confirm(client, TWO, session).json()
        proposed = client.get(BASE + '/context/proposals', headers=ONE).json()
        assert 'Личная секретная задача' not in json.dumps(proposed, ensure_ascii=False)
        assert proposed['items'][0]['changes'] == {'description': 'Новое общее описание'}
        assert client.get(BASE + '/context/proposals', headers=THREE).json()['items'] == []
        review = BASE + f"/context/proposals/{saved['proposal_id']}/review"
        assert client.post(review, headers=TWO, json={'action': 'approve', 'version': 0}).status_code == 403
        # Responsibility is independent of job title: this reviewer is an accountant.
        role(client, ONE, 'accountant')
        assert client.post(review, headers=ONE, json={'action': 'approve', 'version': 0}).status_code == 200
        company = businesses.get_context('U_26030')
        assert company['version'] == 1 and company['answers']['description'] == 'Новое общее описание'
        assert 'personal_tasks' not in company['answers']
        assert 'Личная секретная задача' not in json.dumps(company, ensure_ascii=False)
        assert client.post(review, headers=ONE, json={'action': 'approve', 'version': 1}).status_code == 409
        assert client.post(BASE + '/context', headers=TWO, json={'version': 1, **company['answers']}).status_code == 403
        assert client.post(BASE + '/context', json={'version': 1, **company['answers']}).status_code == 403


def test_next_member_receives_shared_context_and_only_own_personal_context(dataset, model, monkeypatch):
    with TestClient(api.app) as client:
        role(client, TWO)
        session = completed(client, TWO)
        proposal_id = confirm(client, TWO, session).json()['proposal_id']
        client.post(BASE + f'/context/proposals/{proposal_id}/review', headers=ONE, json={'action': 'approve', 'version': 0})
        role(client, THREE, 'treasury')
        profile = dialogue.profile_context('U_26030', 'member-3')
        assert profile['company_answers']['description'] == 'Новое общее описание'
        assert profile['member']['role_label'] == 'Руководитель казначейства'
        assert profile['answers']['personal_tasks'] == ''
        assert 'планирование бюджета' not in json.dumps(profile, ensure_ascii=False)
        # Role changes invalidate an unfinished interview without exposing its history to another member.
        old = client.post(BASE + '/context/dialogue/start', headers=THREE).json()
        assert role(client, THREE, 'owner').status_code == 200
        assert client.get(BASE + '/context/dialogue', headers=THREE).json()['session'] is None
        new = client.post(BASE + '/context/dialogue/start', headers=THREE).json()
        assert new['id'] != old['id']
        assert new['member_role'] == 'Собственник бизнеса'


def test_stale_shared_proposal_cannot_overwrite_newer_company_context(dataset, model):
    with TestClient(api.app) as client:
        role(client, TWO); role(client, THREE)
        a = confirm(client, TWO, completed(client, TWO)).json()['proposal_id']
        b = confirm(client, THREE, completed(client, THREE)).json()['proposal_id']
        assert client.post(BASE + f'/context/proposals/{a}/review', headers=ONE, json={'action': 'approve', 'version': 0}).status_code == 200
        assert client.post(BASE + f'/context/proposals/{b}/review', headers=ONE, json={'action': 'approve', 'version': 1}).status_code == 409
        assert client.post(BASE + f'/context/proposals/{b}/review', headers=ONE, json={'action': 'reject', 'version': 1}).status_code == 200
        assert businesses.get_context('U_26030')['version'] == 1


def test_private_context_cache_keys_and_reseed_preservation(dataset, model):
    seed, original = dataset
    with TestClient(api.app) as client:
        source = client.get(BASE + '/onboarding').json()['sources'][0]['id']
        client.post(BASE + '/onboarding', json={'source_ids': [source]})
        role(client, TWO); role(client, THREE, 'treasury')
        confirm(client, TWO, completed(client, TWO, 'Личный бюджет сотрудника 2'))
        confirm(client, THREE, completed(client, THREE, 'Валютная ликвидность сотрудника 3'))
        first = businesses.business_detail('U_26030')
        first['user_context'] = member_context.profile('U_26030', 'member-2')
        second = dict(first, user_context=member_context.profile('U_26030', 'member-3'))
        key_a, payload_a, public_a = recommendations.context(first)
        key_b, payload_b, public_b = recommendations.context(second)
        assert key_a != key_b
        assert 'Личный бюджет' not in json.dumps(payload_b, ensure_ascii=False)
        assert 'Валютная ликвидность' not in json.dumps(public_a, ensure_ascii=False)
        assert payload_a['business']['user_context']['id'] == 'member-2'
        with sqlite3.connect(businesses.db_path()) as conn:
            conn.execute('ALTER TABLE context_proposals DROP COLUMN author_role')
            conn.execute("UPDATE dataset_meta SET version='force-member-reseed'")
        original(businesses.db_path(), seed)
        assert client.get(BASE + '/member-context', headers=TWO).json()['member']['confirmed']
        assert len(client.get(BASE + '/context/proposals', headers=ONE).json()['items']) == 2
        with businesses.connection() as conn:
            assert conn.execute("SELECT count(*) FROM context_dialogues WHERE member_id<>''").fetchone()[0] == 2


def test_role_and_personal_tasks_affect_ranking_without_leaking_between_users():
    articles = [dict(id=1, title='Новая отчётность для компаний', text='Бухгалтерия и налоги'),
                dict(id=2, title='Изменилась валютная ликвидность', text='Валюта и платежи')]
    business = dict(industry='Производство мебели', context={})
    relations = dict(sectors=[])
    accountant = dict(business, user_context=dict(role='accountant', answers={}))
    treasury = dict(business, user_context=dict(role='treasury', answers={}))
    assert recommendations.rank_articles(articles, accountant, relations)[0]['id'] == 1
    assert recommendations.rank_articles(articles, treasury, relations)[0]['id'] == 2
    treasury['user_context']['answers'] = dict(personal_tasks='Особенно важна бухгалтерия и отчётность')
    assert recommendations.rank_articles(articles, treasury, relations)[0]['id'] == 1
