import json
import sqlite3
from pathlib import Path


class Database:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute('PRAGMA journal_mode=WAL')
        self.conn.executescript('''
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, external_id TEXT NOT NULL,
            url TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
            published_at TEXT, metadata TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'pending_fetch', topic TEXT, severity TEXT,
            model TEXT, classifier_version TEXT, attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT, discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            classified_at TEXT, UNIQUE(source_id, external_id), UNIQUE(url)
        );
        CREATE TABLE IF NOT EXISTS run_progress (
            run_id INTEGER PRIMARY KEY, phase TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS run_items (
            run_id INTEGER NOT NULL, news_id INTEGER NOT NULL, state TEXT NOT NULL,
            topic TEXT, severity TEXT, PRIMARY KEY(run_id, news_id)
        );
        CREATE TABLE IF NOT EXISTS ai_usage (
            id INTEGER PRIMARY KEY, news_id INTEGER NOT NULL, run_id INTEGER,
            model TEXT NOT NULL, prompt_tokens INTEGER, completion_tokens INTEGER,
            total_tokens INTEGER, failed INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ai_usage_run ON ai_usage(run_id);
        CREATE INDEX IF NOT EXISTS news_status ON news(status, attempts);
        ''')

    def insert(self, source_id, item):
        with self.conn:
            cursor = self.conn.execute('''INSERT OR IGNORE INTO news
                (source_id, external_id, url, title, text, published_at, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (source_id, item.external_id, item.url, item.title, item.text,
                 item.published_at, json.dumps(item.metadata, ensure_ascii=False)))
        return cursor.rowcount

    def pending(self, status, limit):
        return self.conn.execute('SELECT * FROM news WHERE status=? AND attempts<5 ORDER BY attempts, id LIMIT ?',
                                 (status, limit)).fetchall()

    def fetched(self, row_id, item):
        with self.conn:
            self.conn.execute("UPDATE news SET title=?, text=?, metadata=?, status='pending_classification', attempts=0, last_error=NULL WHERE id=?",
                              (item.title, item.text, json.dumps(item.metadata, ensure_ascii=False), row_id))

    def failed(self, row_id, error):
        with self.conn:
            self.conn.execute('UPDATE news SET attempts=attempts+1, last_error=? WHERE id=?', (str(error)[:1000], row_id))

    def classified(self, row_id, labels, model, version):
        with self.conn:
            self.conn.execute("""UPDATE news SET topic=?, severity=?, model=?, classifier_version=?,
                status='classified', classified_at=CURRENT_TIMESTAMP, last_error=NULL WHERE id=?""",
                (labels['topic'], labels['severity'], model, version, row_id))

    def record_usage(self, news_id, run_id, model, usage, failed):
        usage = usage or {}
        with self.conn:
            self.conn.execute("""INSERT INTO ai_usage
                (news_id,run_id,model,prompt_tokens,completion_tokens,total_tokens,failed)
                VALUES (?,?,?,?,?,?,?)""", (news_id, run_id, model,
                usage.get('prompt_tokens'), usage.get('completion_tokens'),
                usage.get('total_tokens'), int(failed)))

    def usage(self, run_id=None):
        where, args = ('WHERE run_id=?', (run_id,)) if run_id is not None else ('', ())
        result = dict(self.conn.execute(f"""SELECT count(*) AS requests,
            coalesce(sum(prompt_tokens),0) AS input_tokens,
            coalesce(sum(completion_tokens),0) AS output_tokens,
            coalesce(sum(total_tokens),0) AS total_tokens,
            coalesce(sum(total_tokens IS NULL),0) AS unknown_requests,
            min(created_at) AS since FROM ai_usage {where}""", args).fetchone())

        # Reference estimate only: DeepSeek V4.1 Flash, uncached off-peak/peak.
        # Do not silently apply these rates to other models or missing usage.
        priced = self.conn.execute(f"""SELECT
            coalesce(sum(CASE WHEN model='deepseek/deepseek-v4.1-flash'
                AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL
                THEN prompt_tokens * 0.15 / 1000000 + completion_tokens * 0.60 / 1000000 ELSE 0 END),0) AS usd,
            coalesce(sum(CASE WHEN model='deepseek/deepseek-v4.1-flash'
                AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL THEN 0 ELSE 1 END),0) AS excluded
            FROM ai_usage {where}""", args).fetchone()
        result['estimated_usd'] = priced['usd'] if priced['excluded'] < result['requests'] or not result['requests'] else None
        result['estimated_peak_usd'] = result['estimated_usd'] * 2 if result['estimated_usd'] is not None else None
        result['unpriced_requests'] = priced['excluded']
        return result

    def phase(self, run_id, phase):
        if run_id is not None:
            with self.conn:
                self.conn.execute('INSERT OR REPLACE INTO run_progress VALUES (?,?)', (run_id, phase))

    def queue_items(self, run_id, rows):
        if run_id is not None:
            with self.conn:
                self.conn.executemany("INSERT INTO run_items(run_id,news_id,state) VALUES (?,?,'queued')",
                                      [(run_id, row['id']) for row in rows])

    def item_progress(self, run_id, news_id, state, labels=None):
        if run_id is not None:
            labels = labels or {}
            with self.conn:
                self.conn.execute('UPDATE run_items SET state=?,topic=?,severity=? WHERE run_id=? AND news_id=?',
                    (state, labels.get('topic'), labels.get('severity'), run_id, news_id))

    def progress(self, run_id):
        row = self.conn.execute('SELECT phase FROM run_progress WHERE run_id=?', (run_id,)).fetchone()
        if not row:
            return None
        items = [dict(r) for r in self.conn.execute("""SELECT i.news_id,i.state,i.topic,i.severity,coalesce(nullif(trim(n.title),''),substr(n.text,1,140)) AS title,n.source_id
            FROM run_items i JOIN news n ON n.id=i.news_id WHERE i.run_id=? ORDER BY i.news_id""", (run_id,))]
        counts = {state: sum(i['state'] == state for i in items)
                  for state in ('queued', 'running', 'completed', 'failed', 'interrupted')}
        return {'phase': row['phase'], 'total': len(items), 'counts': counts, 'items': items}
