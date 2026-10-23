"""Run once per cron invocation: python -m backend.main."""
import argparse
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
import fcntl
import json
import logging
from itertools import islice
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from .collectors import COLLECTORS
from .collectors.base import Item
from .classifier import create_classifier, VERSION
from .db import Database

log = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parent


def run(db, sources, client, classifier=None, limit=100, run_id=None):
    workers = int(os.getenv('AI_CONCURRENCY', '5'))
    if not 1 <= workers <= 20:
        raise ValueError('AI_CONCURRENCY must be between 1 and 20')
    collectors = {s['id']: COLLECTORS[s['type']](s, client) for s in sources if s.get('enabled', True)}
    stats = dict(discovered=0, fetched=0, classified=0, errors=0)
    db.phase(run_id, 'discovering')
    for source_id, collector in collectors.items():
        try:
            source = next(s for s in sources if s['id'] == source_id)
            max_items = source.get('max_items', 50)
            if not isinstance(max_items, int) or not 1 <= max_items <= 500:
                raise ValueError('max_items must be between 1 and 500')
            for item in islice(collector.discover(), max_items):
                stats['discovered'] += db.insert(source_id, item)
        except Exception:
            stats['errors'] += 1
            log.exception('Discovery failed: %s', source_id)
    db.phase(run_id, 'fetching')
    for row in db.pending('pending_fetch', limit):
        if row['source_id'] not in collectors:
            continue
        try:
            item = Item(row['external_id'], row['url'], row['title'], row['text'],
                        row['published_at'], json.loads(row['metadata']))
            db.fetched(row['id'], collectors[row['source_id']].hydrate(item))
            stats['fetched'] += 1
        except Exception as error:
            db.failed(row['id'], error)
            stats['errors'] += 1
            log.warning('Fetch failed for item %s: %s', row['id'], type(error).__name__)
    if classifier:
        def classify(row):
            text = row['title'] + '\n\n' + row['text']
            if hasattr(classifier, 'classify_with_usage'):
                return classifier.classify_with_usage(text)
            try:
                return classifier.classify(text), None, None
            except Exception as error:
                return None, None, error

        rows = db.pending('pending_classification', limit)
        db.queue_items(run_id, rows)
        db.phase(run_id, 'labeling')
        log.info('Classifying %s items with up to %s concurrent requests', len(rows), workers)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            remaining = iter(rows)
            futures = {}

            def submit_next():
                row = next(remaining, None)
                if row is not None:
                    db.item_progress(run_id, row['id'], 'running')
                    futures[pool.submit(classify, row)] = row

            for _ in range(min(workers, len(rows))):
                submit_next()
            while futures:
                completed, _ = wait(futures, return_when=FIRST_COMPLETED)
                for future in completed:
                    row = futures.pop(future)
                    try:
                        labels, usage, error = future.result()
                    except Exception as exception:
                        labels, usage, error = None, None, exception
                    # SQLite stays on the owning thread; persist each response immediately.
                    db.record_usage(row['id'], run_id, classifier.model, usage, error is not None)
                    if error is None:
                        db.classified(row['id'], labels, classifier.model, VERSION)
                        db.item_progress(run_id, row['id'], 'completed', labels)
                        stats['classified'] += 1
                    else:
                        db.failed(row['id'], error)
                        db.item_progress(run_id, row['id'], 'failed')
                        stats['errors'] += 1
                        log.warning('Classification failed for item %s: %s', row['id'], type(error).__name__)
                    submit_next()
    db.phase(run_id, 'finished' if classifier else 'disabled')
    return stats


def main():
    load_dotenv(ROOT.parent / '.env')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, default=ROOT / 'sources.json')
    parser.add_argument('--db', default=os.getenv('NEWS_DB', str(ROOT / 'data/news.sqlite3')))
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--scrape-only', action='store_true', help='Persist text without calling OpenAI')
    args = parser.parse_args()
    if args.limit < 1:
        parser.error('--limit must be positive')
    logging.basicConfig(level=logging.INFO)
    sources = json.loads(args.sources.read_text())
    if len({s['id'] for s in sources}) != len(sources):
        parser.error('Source IDs must be unique')
    Path(args.db).parent.mkdir(parents=True, exist_ok=True)
    # OS releases the lock on crashes. Covers the full fetch/classify run.
    with open(str(Path(args.db).resolve()) + '.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log.info('Another ingestion run is active; skipping')
            return
        classifier = None if args.scrape_only else create_classifier()
        db = Database(args.db)
        try:
            with httpx.Client(timeout=25, follow_redirects=True,
                              headers={'User-Agent': 'NewsIngest/0.1 (RSS and public news collector)'}) as client:
                stats = run(db, sources, client, classifier, args.limit)
                print(json.dumps(stats))
                if stats['errors']:
                    raise SystemExit(1)
        finally:
            db.conn.close()


if __name__ == '__main__':
    main()
