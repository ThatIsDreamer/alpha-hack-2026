import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import httpx
from backend.collectors.base import fetch
from backend.collectors.rss import RSSCollector
from backend.collectors.website import WebsiteCollector
from backend.db import Database


def test_sources_have_no_duplicates():
    sources = json.loads((Path(__file__).parents[1] / 'sources.json').read_text())
    assert len({s['id'] for s in sources}) == len(sources)
    for key in ('url', 'channel'):
        values = [s[key].lower().rstrip('/') for s in sources if key in s]
        assert len(values) == len(set(values))
    assert sum(s['id'] == 'kommersant' for s in sources) == 1
    assert [s['id'] for s in sources if s.get('verify_tls') is False] == ['rosstat']


def test_tls_opt_out_is_scoped_to_dedicated_client():
    shared = MagicMock(timeout=25, headers={'User-Agent': 'test'})
    with patch('backend.collectors.base.httpx.Client') as factory:
        fetch(shared, 'https://rosstat.gov.ru/test', verify_tls=False)
        assert factory.call_args.kwargs['verify'] is False
        shared.get.assert_not_called()
    fetch(shared, 'https://example.com/test')
    shared.get.assert_called_once()


def test_rbc_full_text_extension():
    xml = '''<rss version="2.0" xmlns:rbc_news="http://www.rbc.ru"><channel><item>
    <title>Заголовок</title><link>https://www.rbc.ru/test</link><description>Анонс</description>
    <rbc_news:full-text>Полный текст новости</rbc_news:full-text></item></channel></rss>'''
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=xml)))
    collector = RSSCollector({'url':'https://example.com/rss','content_field':'rbc_news_full-text','fetch_articles':False}, client)
    item = collector.hydrate(next(collector.discover()))
    assert item.text == 'Полный текст новости'
    assert item.metadata['text_kind'] == 'feed_content'


def test_website_uses_article_heading_and_persists_it(tmp_path):
    html = '<html><body><h1>Commodity Markets Outlook</h1><article><p>' + 'Real article text. ' * 50 + '</p></article></body></html>'
    def response(request):
        return httpx.Response(200, text='<a href="/article">EN</a>' if request.url.path == '/' else html)
    client = httpx.Client(transport=httpx.MockTransport(response))
    collector = WebsiteCollector({'type':'website','url':'https://example.com/','link_selector':'a'}, client)
    item = next(collector.discover())
    db = Database(tmp_path / 'test.sqlite3')
    db.insert('worldbank', item)
    db.fetched(1, collector.hydrate(item))
    assert db.conn.execute('SELECT title FROM news').fetchone()[0] == 'Commodity Markets Outlook'
