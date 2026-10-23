import csv
import gzip
import sqlite3
from pathlib import Path

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from backend import api, businesses


def write_seed(folder, name, fields, records):
    with gzip.open(folder / name, 'wt', encoding='utf-8', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=fields, delimiter=';')
        writer.writeheader()
        writer.writerows(records)


@pytest.fixture
def dataset(tmp_path, monkeypatch):
    seed = tmp_path / 'seed'
    seed.mkdir()
    fields = next(businesses.rows(businesses.SEED / businesses.FILES[0])).keys()
    def company(uid, group, revenue, code='41.20'):
        row = dict.fromkeys(fields, '')
        row.update(SYNTHETIC_U=uid, GROUP_ID=group, REVENUE_COMPANY=str(revenue),
                   MAINOKVED_CODE=code, MAINOKVED_NAME='Строительство зданий', CITY='Москва',
                   CL_PRODUCT_LOA_MARK='1.0', AMOUNT_WORKERS_FNS_GRADATION='101-250',
                   FTS_COUNTRY_NAME='КИТАЙ, ТУРЦИЯ', FTS_FLAG='1.0')
        return row
    write_seed(seed, businesses.FILES[0], fields, [company('U_26030', 'g1', 100), company('U_2', 'g1', 200), company('U_3', 'g2', 50), company('U_428697', 'junk', 999)])
    write_seed(seed, businesses.FILES[1], ['PAYER','BENEFICIARY','PAY_AMT','PAY_CNT'], [
        dict(PAYER='U_26030', BENEFICIARY='U_26030', PAY_AMT='10000', PAY_CNT=100),
        dict(PAYER='U_26030', BENEFICIARY='U_2', PAY_AMT='10.11', PAY_CNT=1),
        dict(PAYER='U_26030', BENEFICIARY='U_2', PAY_AMT='9.89', PAY_CNT=2),
        dict(PAYER='U_26030', BENEFICIARY='unknown', PAY_AMT='80', PAY_CNT=4),
        dict(PAYER='U_3', BENEFICIARY='U_26030', PAY_AMT='50', PAY_CNT=1)])
    write_seed(seed, businesses.FILES[2], ['SYNTHETIC_F','SYNTHETIC_U','CITY_NAME','RC_NAME'], [dict(SYNTHETIC_F='F1', SYNTHETIC_U='U_26030', CITY_NAME='Москва', RC_NAME='МОСКОВСКИЙ')])
    monkeypatch.setenv('BIZ_DB', str(tmp_path / 'businesses.sqlite3'))
    monkeypatch.setenv('NEWS_DB', str(tmp_path / 'news.sqlite3'))
    monkeypatch.setenv('ENABLE_SCHEDULER', 'false')
    original = businesses.import_dataset
    monkeypatch.setattr(businesses, 'import_dataset', lambda target: original(target, seed))
    return seed, original


def test_clean_import_and_profiles(dataset):
    with TestClient(api.app) as client:
        listing = client.get('/api/businesses').json()
        assert listing['total'] == 3 and listing['items'][0]['id'] == 'U_26030'
        assert client.get('/api/businesses?q=МОСКВА%20строительство').json()['total'] == 3
        assert len(client.get('/api/businesses?limit=1&offset=1').json()['items']) == 1
        assert client.get('/api/businesses?limit=1000').status_code == 422
        assert client.get('/api/businesses?offset=-1').status_code == 422
        assert client.get('/api/businesses?q=%25').json()['total'] == 0
        assert client.get('/api/businesses/U_428697').status_code == 404
        profile = client.get('/api/businesses/U_26030').json()
        assert profile['industry_code'] == '41.2'
        assert profile['countries'] == ['КИТАЙ', 'ТУРЦИЯ']
        assert profile['products']['loan'] is True and profile['products']['leasing'] is None
        assert profile['employees_range'] == '101-250'
        assert profile['group']['revenue_rub'] == 300 and profile['group']['company_count'] == 2
        outgoing = profile['payments']['outgoing']
        assert outgoing == {'counterparties': 2, 'amount_rub': 100, 'payment_count': 7, 'known_counterparty_turnover_share': 0.2}
        assert profile['payments']['incoming']['amount_rub'] == 50
        assert profile['linked_people_count'] == 1
        group = client.get('/api/business-groups/g1?limit=1').json()
        assert group['total'] == 2 and len(group['items']) == 1
        assert client.get('/api/business-groups/missing').status_code == 404
        assert client.get('/api/recommendations').status_code == 404
    before = businesses.db_path().stat().st_mtime_ns
    businesses.import_dataset(businesses.db_path())
    assert businesses.db_path().stat().st_mtime_ns == before


def test_future_recommendation_context_is_per_request(dataset):
    from fastapi import FastAPI
    harness = FastAPI()
    @harness.get('/future')
    def future(profile=Depends(businesses.recommendation_business)):
        return {'business_id': profile['id'], 'group_id': profile['group_id']}
    businesses.import_dataset(businesses.db_path())
    with TestClient(harness) as client:
        assert client.get('/future').status_code == 422
        assert client.get('/future', headers={'X-Business-ID': 'missing'}).status_code == 404
        assert client.get('/future', headers={'X-Business-ID': 'U_26030'}).json()['group_id'] == 'g1'
        assert client.get('/future', headers={'X-Business-ID': 'U_3'}).json()['group_id'] == 'g2'
        assert client.get('/future').status_code == 422  # No server-side remembered selection.


def test_failed_reimport_keeps_previous_database(dataset):
    seed, original = dataset
    businesses.import_dataset(businesses.db_path())
    write_seed(seed, businesses.FILES[1], ['PAYER','BENEFICIARY','PAY_AMT','PAY_CNT'], [dict(PAYER='a', BENEFICIARY='b', PAY_AMT='broken', PAY_CNT=1)])
    with pytest.raises(Exception):
        original(businesses.db_path(), seed)
    with businesses.connection() as conn:
        assert conn.execute('SELECT count(*) FROM businesses').fetchone()[0] == 3
    assert not Path(str(businesses.db_path()) + '.importing').exists()
