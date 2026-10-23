"""Explicit product relevance rules, not an official OKVED/news equivalence."""
import json

VERSION = 'okved-news-v1'


def news_topics(code):
    try:
        division = int(code.split('.')[0])
    except (ValueError, AttributeError):
        return ['other']
    if not 1 <= division <= 99:
        return ['other']
    # Macro, business and regulatory developments can affect every business.
    result = {'business', 'economy', 'law'}
    for divisions, topics in [
        ({1, 2, 3, 6, 7, 8, 9, 19, 20, 35, 36, 37, 38, 39}, {'environment'}),
        ({26, 27, 28, 29, 30, 33, 58, 61, 62, 63, 71}, {'technology'}),
        ({21, 72}, {'science'}), ({21, 75, 86, 87, 88}, {'health'}),
        ({58, 59, 60, 90, 91}, {'culture'}), ({93}, {'sports'}),
        ({78, 84, 85, 87, 88, 94, 96, 97, 98}, {'society'}),
        ({84, 99}, {'politics'}),
    ]:
        if division in divisions:
            result.update(topics)
    return sorted(result)


def migrate_categories(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS business_categories (
        business_id TEXT PRIMARY KEY, topics TEXT NOT NULL, mapping_version TEXT NOT NULL)''')
    conn.executemany('INSERT OR REPLACE INTO business_categories VALUES (?,?,?)',
        ((row[0], json.dumps(news_topics(row[1])), VERSION) for row in conn.execute('''
        SELECT b.id,b.industry_code FROM businesses b LEFT JOIN business_categories c ON c.business_id=b.id
        WHERE c.business_id IS NULL OR c.mapping_version<>?''', (VERSION,)).fetchall()))
