"""Separate, versioned SQLite store for the synthetic business dataset.

Selection belongs to the browser; this module never stores a user's selection.
"""
import csv
import gzip
import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from decimal import Decimal
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field, StrictStr

SEED = Path(__file__).parent / 'business_seed'
FILES = ('df_Uid_data_hack.csv.gz', 'df_Uid_payment_hack.csv.gz', 'df_Fid_Uid_link_hack.csv.gz')
DEMO_IDS = ('U_26030', 'U_34911', 'U_1465', 'U_5658', 'U_3263', 'U_212593', 'U_25835', 'U_81081')
PRODUCTS = {'rko': 'CL_PRODUCT_RKO_MARK', 'guarantee': 'CL_PRODUCT_GAR_MARK',
            'loan': 'CL_PRODUCT_LOA_MARK', 'leasing': 'CL_PRODUCT_LEA_MARK',
            'deposit': 'CL_PRODUCT_DEP_MARK', 'payroll': 'CL_PRODUCT_ZPP_MARK', 'factoring': 'FACTORING_MARK'}
router = APIRouter(prefix='/api', tags=['Businesses'])


def db_path():
    # Default next to NEWS_DB so the existing Railway volume persists both stores.
    news = Path(os.getenv('NEWS_DB', str(Path(__file__).parent / 'data/news.sqlite3')))
    return Path(os.getenv('BIZ_DB', str(news.with_name('businesses.sqlite3'))))


@contextmanager
def connection(write=False):
    mode = 'rw' if write else 'ro'
    conn = sqlite3.connect(f'{db_path().resolve().as_uri()}?mode={mode}', uri=True, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def migrate_onboarding(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS business_onboarding (
        business_id TEXT PRIMARY KEY, source_ids TEXT NOT NULL,
        completed_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")


def source_catalog():
    return [{'id': s['id'], 'name': s.get('name', s['id']), 'type': s['type'],
             'enabled': s.get('enabled', True)}
            for s in json.loads((Path(__file__).parent / 'sources.json').read_text())]


def onboarding_state(conn, business_id):
    row = conn.execute('SELECT * FROM business_onboarding WHERE business_id=?', (business_id,)).fetchone()
    return {'business_id': business_id, 'completed': row is not None,
            'source_ids': json.loads(row['source_ids']) if row else [],
            'completed_at': row['completed_at'] if row else None,
            'updated_at': row['updated_at'] if row else None}


def rows(path):
    opener = gzip.open if str(path).endswith('.gz') else open
    with opener(path, 'rt', encoding='utf-8-sig', newline='') as file:
        yield from csv.DictReader(file, delimiter=';')


def money(value):
    """Store rubles as integer kopecks; avoid accumulating floating point error."""
    return int((Decimal(value or '0') * 100).quantize(Decimal('1')))


def flag(value):
    return None if not value else Decimal(value) == 1


def normalize_okved(value):
    parts = value.split('.')
    return '.'.join([parts[0]] + [p.rstrip('0') or '0' for p in parts[1:]])


def import_dataset(target, seed=SEED):
    """Build a new file atomically; interrupted imports never replace a good DB."""
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    fingerprint = hashlib.sha256(b'business-schema-v1')
    for name in FILES:
        with (seed / name).open('rb') as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b''):
                fingerprint.update(chunk)
    version = fingerprint.hexdigest()
    if target.exists():
        with sqlite3.connect(target) as old:
            if old.execute("SELECT 1 FROM sqlite_master WHERE name='dataset_meta'").fetchone():
                if old.execute('SELECT version FROM dataset_meta').fetchone() == (version,):
                    migrate_onboarding(old)
                    return
    temp = target.with_name(target.name + '.importing')
    temp.unlink(missing_ok=True)
    conn = sqlite3.connect(temp)
    try:
        conn.executescript('''
        CREATE TABLE dataset_meta(version TEXT PRIMARY KEY);
        CREATE TABLE businesses(id TEXT PRIMARY KEY, group_id TEXT, industry_code TEXT,
            industry TEXT, city TEXT, region TEXT, revenue_kopecks INTEGER, demo_rank INTEGER,
            search_text TEXT NOT NULL, profile TEXT NOT NULL);
        CREATE TABLE payments(payer TEXT NOT NULL, beneficiary TEXT NOT NULL,
            amount_kopecks INTEGER NOT NULL, payment_count INTEGER NOT NULL,
            PRIMARY KEY(payer,beneficiary));
        CREATE TABLE person_links(person_id TEXT NOT NULL, business_id TEXT NOT NULL,
            city TEXT, district TEXT, PRIMARY KEY(person_id,business_id));
        ''')
        with conn:
            for row in rows(seed / FILES[0]):
                uid = row['SYNTHETIC_U']
                if uid == 'U_428697':
                    continue
                code = normalize_okved(row['MAINOKVED_CODE'])
                search = ' '.join([uid, row['GROUP_ID'], row['MAINOKVED_NAME'], code, row['CITY'], row['REGION']]).casefold()
                conn.execute('INSERT INTO businesses VALUES (?,?,?,?,?,?,?,?,?,?)',
                    (uid, row['GROUP_ID'] or None, code, row['MAINOKVED_NAME'], row['CITY'], row['REGION'],
                     money(row['REVENUE_COMPANY']) if row['REVENUE_COMPANY'] else None,
                     DEMO_IDS.index(uid) if uid in DEMO_IDS else 100, search, json.dumps(row, ensure_ascii=False)))
            conn.executemany('''INSERT INTO payments VALUES (?,?,?,?)
                ON CONFLICT(payer,beneficiary) DO UPDATE SET
                amount_kopecks=amount_kopecks+excluded.amount_kopecks,
                payment_count=payment_count+excluded.payment_count''',
                ((r['PAYER'], r['BENEFICIARY'], money(r['PAY_AMT']), int(r['PAY_CNT']))
                 for r in rows(seed / FILES[1]) if r['PAYER'] != r['BENEFICIARY']))
            conn.executemany('INSERT OR IGNORE INTO person_links VALUES (?,?,?,?)',
                ((r['SYNTHETIC_F'], r['SYNTHETIC_U'], r['CITY_NAME'], r['RC_NAME']) for r in rows(seed / FILES[2])))
            conn.execute('INSERT INTO dataset_meta VALUES (?)', (version,))
        conn.executescript('''
        CREATE INDEX business_group ON businesses(group_id);
        CREATE INDEX business_order ON businesses(demo_rank,id);
        CREATE INDEX payment_beneficiary ON payments(beneficiary);
        CREATE INDEX person_business ON person_links(business_id);
        CREATE TABLE business_groups AS SELECT group_id AS id, count(*) AS company_count,
            sum(revenue_kopecks) AS revenue_kopecks FROM businesses WHERE group_id IS NOT NULL GROUP BY group_id;
        CREATE UNIQUE INDEX group_id ON business_groups(id);
        ANALYZE;
        ''')
        # Mutable onboarding data must survive every seed replacement.
        migrate_onboarding(conn)
        if target.exists():
            with sqlite3.connect(target) as old:
                if old.execute("SELECT 1 FROM sqlite_master WHERE name='business_onboarding'").fetchone():
                    conn.executemany('INSERT INTO business_onboarding VALUES (?,?,?,?)',
                                     old.execute('SELECT business_id,source_ids,completed_at,updated_at FROM business_onboarding'))
        conn.commit()
        conn.close()
        os.replace(temp, target)
    except BaseException:
        conn.close()
        temp.unlink(missing_ok=True)
        raise


def summary(row):
    return {'id': row['id'], 'display_name': row['id'], 'group_id': row['group_id'],
            'industry_code': row['industry_code'], 'industry': row['industry'],
            'city': row['city'], 'region': row['region'],
            'revenue_rub': row['revenue_kopecks'] / 100 if row['revenue_kopecks'] is not None else None,
            'is_demo': row['demo_rank'] < 100}


@router.get('/businesses')
def list_businesses(q: str = Query('', max_length=150), limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0)):
    terms = q.casefold().split()
    where = ' AND '.join('instr(search_text,?)>0' for _ in terms) or '1=1'
    with connection() as conn:
        total = conn.execute(f'SELECT count(*) FROM businesses WHERE {where}', terms).fetchone()[0]
        result = conn.execute(f'SELECT * FROM businesses WHERE {where} ORDER BY demo_rank,id LIMIT ? OFFSET ?', [*terms, limit, offset])
        return {'items': [summary(r) for r in result], 'total': total, 'limit': limit, 'offset': offset}


@router.get('/businesses/{business_id}')
def business_detail(business_id: str):
    with connection() as conn:
        row = conn.execute('SELECT * FROM businesses WHERE id=?', (business_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Компания не найдена')
        raw = json.loads(row['profile'])
        group = conn.execute('SELECT * FROM business_groups WHERE id=?', (row['group_id'],)).fetchone()
        flows = {}
        for direction, own, counterparty in [('outgoing', 'payer', 'beneficiary'), ('incoming', 'beneficiary', 'payer')]:
            data = conn.execute(f'''SELECT count(*) AS counterparties, coalesce(sum(p.amount_kopecks),0) AS amount,
                coalesce(sum(p.payment_count),0) AS payment_count,
                coalesce(sum(CASE WHEN b.id IS NOT NULL THEN p.amount_kopecks ELSE 0 END),0) AS known
                FROM payments p LEFT JOIN businesses b ON b.id=p.{counterparty} WHERE p.{own}=?''', (business_id,)).fetchone()
            flows[direction] = {'counterparties': data['counterparties'], 'amount_rub': data['amount']/100,
                'payment_count': data['payment_count'], 'known_counterparty_turnover_share': data['known']/data['amount'] if data['amount'] else None}
        return summary(row) | {
            'onboarding': onboarding_state(conn, business_id),
            'group': {'id': group['id'], 'company_count': group['company_count'],
                      'revenue_rub': group['revenue_kopecks']/100 if group['revenue_kopecks'] is not None else None} if group else None,
            'age_range': raw['COMPANY_AGE_YEARS_GRADATION'] or None,
            'employees_range': raw['AMOUNT_WORKERS_FNS_GRADATION'] or None,
            'lifecycle': raw['ECO_MARK_LABEL'] or None, 'client_type': raw['CL_TYPE'] or None,
            'negative_mark': flag(raw['NEGATIVEMARK']),
            'products': {name: flag(raw[key]) for name, key in PRODUCTS.items()},
            'foreign_trade': flag(raw['FTS_FLAG']),
            'countries': [c.strip() for c in raw['FTS_COUNTRY_NAME'].split(',') if c.strip()],
            'payments': flows,
            'linked_people_count': conn.execute('SELECT count(*) FROM person_links WHERE business_id=?', (business_id,)).fetchone()[0],
            'raw_profile': raw, 'synthetic': True,
        }


class OnboardingInput(BaseModel):
    source_ids: list[StrictStr] = Field(min_length=1, max_length=100)


@router.get('/businesses/{business_id}/onboarding')
def get_onboarding(business_id: str):
    with connection() as conn:
        if not conn.execute('SELECT 1 FROM businesses WHERE id=?', (business_id,)).fetchone():
            raise HTTPException(404, 'Компания не найдена')
        return onboarding_state(conn, business_id) | {'sources': source_catalog()}


@router.post('/businesses/{business_id}/onboarding')
def save_onboarding(business_id: str, payload: OnboardingInput):
    sources = sorted(set(payload.source_ids))
    catalog = {s['id'] for s in source_catalog()}
    if any(source not in catalog for source in sources):
        raise HTTPException(422, 'Неизвестный источник новостей')
    now = datetime.now(timezone.utc).isoformat()
    with connection(write=True) as conn, conn:
        if not conn.execute('SELECT 1 FROM businesses WHERE id=?', (business_id,)).fetchone():
            raise HTTPException(404, 'Компания не найдена')
        conn.execute("""INSERT INTO business_onboarding VALUES (?,?,?,?)
            ON CONFLICT(business_id) DO UPDATE SET source_ids=excluded.source_ids,
                updated_at=excluded.updated_at""", (business_id, json.dumps(sources), now, now))
        return onboarding_state(conn, business_id)


@router.get('/business-groups/{group_id}')
def business_group(group_id: str, limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0)):
    with connection() as conn:
        group = conn.execute('SELECT * FROM business_groups WHERE id=?', (group_id,)).fetchone()
        if not group:
            raise HTTPException(404, 'Группа не найдена')
        members = conn.execute('SELECT * FROM businesses WHERE group_id=? ORDER BY id LIMIT ? OFFSET ?', (group_id, limit, offset))
        return {'id': group_id, 'total': group['company_count'],
                'revenue_rub': group['revenue_kopecks']/100 if group['revenue_kopecks'] is not None else None,
                'items': [summary(r) for r in members], 'limit': limit, 'offset': offset}


def recommendation_business(x_business_id: str = Header(..., max_length=100)):
    """Dependency for future recommendation routes; selection is never server state."""
    return business_detail(x_business_id)


if __name__ == '__main__':
    import_dataset(db_path())
    with connection() as conn:
        print({table: conn.execute(f'SELECT count(*) FROM {table}').fetchone()[0]
               for table in ('businesses', 'business_groups', 'payments', 'person_links')})
