"""Single-process API and hourly ingestion service sharing the existing volume."""
import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import time

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from .db import Database
from . import businesses, recommendations
from .main import ROOT, run
from .classifier import create_classifier, TOPICS, SEVERITIES


def database():
    return Database(os.getenv('NEWS_DB', str(ROOT / 'data/news.sqlite3')))


def initialize():
    db = database()
    with db.conn:
        db.conn.execute('''CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
            started_at REAL NOT NULL, finished_at REAL, result TEXT, error TEXT)''')
        db.conn.execute("UPDATE run_items SET state='interrupted' WHERE state IN ('queued','running') AND run_id IN (SELECT id FROM runs WHERE status='running')")
        db.conn.execute("UPDATE run_progress SET phase='interrupted' WHERE run_id IN (SELECT id FROM runs WHERE status='running')")
        db.conn.execute("UPDATE runs SET status='interrupted', finished_at=? WHERE status='running'", (time.time(),))
    db.conn.close()


def reserve(kind):
    path = Path(os.getenv('NEWS_DB', str(ROOT / 'data/news.sqlite3'))).resolve()
    lock = open(str(path) + '.lock', 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise HTTPException(409, 'Сбор уже выполняется.')
    db = database()
    try:
        last = db.conn.execute("SELECT started_at FROM runs WHERE kind='demo' ORDER BY id DESC LIMIT 1").fetchone()
        if kind == 'demo' and last and time.time() - last['started_at'] < 300:
            raise HTTPException(429, 'Пробный сбор доступен раз в пять минут. Результат предыдущего запуска — в истории.')
        with db.conn:
            row = db.conn.execute("INSERT INTO runs(kind,status,started_at) VALUES (?,'running',?)", (kind, time.time()))
        db.phase(row.lastrowid, 'discovering')
        return row.lastrowid, lock
    except Exception:
        lock.close()
        raise
    finally:
        db.conn.close()


def execute(run_id, lock, kind):
    db = database()
    try:
        sources = json.loads((ROOT / 'sources.json').read_text())
        if kind == 'demo':
            sources = [dict(s, max_items=5, max_pages=1) for s in sources]
        classifier = None
        if os.getenv('AI_API_KEY') or os.getenv('OPENAI_API_KEY'):
            classifier = create_classifier()
        with httpx.Client(timeout=25, follow_redirects=True, headers={'User-Agent': 'NewsIngest/0.1'}) as client:
            result = run(db, sources, client, classifier, limit=5 if kind == 'demo' else 100, run_id=run_id)
        with db.conn:
            db.conn.execute('UPDATE runs SET status=?, result=?, finished_at=? WHERE id=?',
                            ('partial' if result['errors'] else 'completed', json.dumps(result), time.time(), run_id))
    except Exception as error:
        db.phase(run_id, 'failed')
        with db.conn:
            db.conn.execute("UPDATE run_items SET state='interrupted' WHERE run_id=? AND state IN ('queued','running')", (run_id,))
            db.conn.execute("UPDATE runs SET status='failed',error=?,finished_at=? WHERE id=?",
                            (type(error).__name__, time.time(), run_id))
    finally:
        db.conn.close()
        lock.close()


async def scheduler():
    while True:
        await asyncio.sleep(3600 - time.time() % 3600)
        try:
            run_id, lock = reserve('scheduled')
        except HTTPException:
            continue
        await asyncio.to_thread(execute, run_id, lock, 'scheduled')


@asynccontextmanager
async def lifespan(app):
    if os.getenv('RAILWAY_ENVIRONMENT_ID'):
        mount = os.getenv('RAILWAY_VOLUME_MOUNT_PATH')
        path = Path(os.getenv('NEWS_DB', '/data/news.sqlite3')).resolve()
        if not mount or not path.is_relative_to(Path(mount).resolve()) or not Path(mount).is_dir():
            raise RuntimeError('Persistent database volume is required')
        if not businesses.db_path().resolve().is_relative_to(Path(mount).resolve()):
            raise RuntimeError('Business database must use the persistent volume')
    businesses.import_dataset(businesses.db_path())
    initialize()
    task = asyncio.create_task(scheduler()) if os.getenv('ENABLE_SCHEDULER', 'true') == 'true' else None
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title='Newsroom API', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(','),
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'X-Business-ID'])

app.include_router(businesses.router)
app.include_router(recommendations.router)

@app.get('/health')
def health():
    db = database()
    try:
        db.conn.execute('SELECT 1').fetchone()
        return {'status': 'ok'}
    finally:
        db.conn.close()


@app.get('/api/overview')
def overview():
    db = database()
    try:
        total = db.conn.execute('SELECT count(*) FROM news').fetchone()[0]
        classified = db.conn.execute("SELECT count(*) FROM news WHERE status='classified'").fetchone()[0]
        sources = json.loads((ROOT / 'sources.json').read_text())
        return {'total': total, 'classified': classified, 'pending': total-classified,
                'usage': db.usage(),
                'classification_enabled': bool(os.getenv('AI_API_KEY') or os.getenv('OPENAI_API_KEY')),
                'sources': [{'id': s['id'], 'type': s['type'], 'name': s.get('name', s['id']), 'enabled': s.get('enabled', True)} for s in sources],
                'next_run': datetime.fromtimestamp((int(time.time()) // 3600 + 1)*3600, timezone.utc).isoformat()}
    finally:
        db.conn.close()


def source_info(source_id):
    sources = json.loads((ROOT / 'sources.json').read_text())
    source = next((s for s in sources if s['id'] == source_id), {})
    return {'source_type': source.get('type', 'website'),
            'source_name': source.get('name', source_id),
            'source_channel': source.get('channel')}


@app.get('/api/news')
def news(source: str | None = None, topic: str | None = None, severity: str | None = None, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    db = database()
    try:
        if topic is not None and topic not in TOPICS:
            raise HTTPException(422, 'Неизвестная тема')
        if severity is not None and severity not in SEVERITIES:
            raise HTTPException(422, 'Неизвестный уровень риска')
        where, args = "WHERE status='classified'", []
        for column, value in (('source_id', source), ('topic', topic), ('severity', severity)):
            if value:
                where += f' AND {column}=?'
                args.append(value)
        total = db.conn.execute(f'SELECT count(*) FROM news {where}', args).fetchone()[0]
        rows = db.conn.execute(f'''SELECT id,source_id,title,url,published_at,discovered_at,status,topic,severity,
            substr(text,1,240) AS excerpt FROM news {where} ORDER BY classified_at DESC, id DESC LIMIT ? OFFSET ?''', args+[limit,offset]).fetchall()
        return {'items': [dict(r) | source_info(r['source_id']) for r in rows], 'total': total}
    finally:
        db.conn.close()


@app.get('/api/news/{item_id}')
def article(item_id: int):
    db = database()
    try:
        row = db.conn.execute('SELECT * FROM news WHERE id=?', (item_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Материал не найден')
        item = dict(row) | source_info(row['source_id'])
        item.pop('last_error', None)
        item['metadata'] = json.loads(item['metadata'])
        return item
    finally:
        db.conn.close()


@app.get('/api/runs')
def runs():
    db = database()
    try:
        items = [dict(r) for r in db.conn.execute('SELECT * FROM runs ORDER BY id DESC LIMIT 30')]
        for item in items:
            item['usage'] = db.usage(item['id'])
            item['progress'] = db.progress(item['id'])
            item['result'] = json.loads(item['result']) if item['result'] else None
        return items
    finally:
        db.conn.close()


@app.post('/api/runs', status_code=202)
def trigger(background_tasks: BackgroundTasks):
    run_id, lock = reserve('demo')
    background_tasks.add_task(execute, run_id, lock, 'demo')
    return {'id': run_id, 'status': 'running'}
