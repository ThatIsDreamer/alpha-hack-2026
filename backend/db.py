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
            self.conn.execute("UPDATE news SET text=?, metadata=?, status='pending_classification', attempts=0, last_error=NULL WHERE id=?",
                              (item.text, json.dumps(item.metadata, ensure_ascii=False), row_id))

    def failed(self, row_id, error):
        with self.conn:
            self.conn.execute('UPDATE news SET attempts=attempts+1, last_error=? WHERE id=?', (str(error)[:1000], row_id))

    def classified(self, row_id, labels, model, version):
        with self.conn:
            self.conn.execute("""UPDATE news SET topic=?, severity=?, model=?, classifier_version=?,
                status='classified', classified_at=CURRENT_TIMESTAMP, last_error=NULL WHERE id=?""",
                (labels['topic'], labels['severity'], model, version, row_id))
