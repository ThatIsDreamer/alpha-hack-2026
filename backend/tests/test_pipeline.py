import json
from types import SimpleNamespace
import httpx
import pytest
from backend.main import run
from backend.db import Database
from backend.classifier import OpenAIClassifier
from backend.collectors.telegram import TelegramCollector

FEED = '<rss version="2.0"><channel><title>News</title><item><guid>one</guid><title>Новость</title><link>https://news.test/1</link><description>Текст новости</description></item></channel></rss>'
SOURCES = [{'id': 'test', 'type': 'rss', 'url': 'https://news.test/rss', 'fetch_articles': False}]


def test_dedup_and_retry_without_rescraping(tmp_path):
    db = Database(tmp_path / 'news.sqlite3')
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=FEED)))
    class Classifier:
        model = 'fake'
        calls = 0
        def classify(self, text):
            self.calls += 1
            if self.calls == 1:
                raise ValueError('temporary failure')
            return {'topic': 'society', 'severity': 'none'}
    classifier = Classifier()
    assert run(db, SOURCES, client, classifier)['errors'] == 1
    second = run(db, SOURCES, client, classifier)
    assert second == dict(discovered=0, fetched=0, classified=1, errors=0)
    assert run(db, SOURCES, client, classifier)['classified'] == 0
    assert classifier.calls == 2
    assert db.conn.execute('SELECT count(*) FROM news').fetchone()[0] == 1


def test_telegram_nested_html_and_media():
    html = '''<div class="tgme_widget_message" data-post="test/12"><div class="tgme_widget_message_text">Привет <b>мир &amp; все</b><br>Далее</div><time datetime="2026-10-20T10:00:00+00:00"></time><span class="tgme_widget_message_views">1.2K</span></div><div class="tgme_widget_message" data-post="test/13"></div>'''
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=html)))
    items = list(TelegramCollector({'channel': 'test', 'max_pages': 1}, client).discover())
    assert len(items) == 1
    assert items[0].text == 'Привет мир & все\nДалее'
    assert items[0].external_id == 'test/12'


@pytest.mark.parametrize('content,finish,refusal', [('{"topic":"invalid","severity":"none"}', 'stop', None), ('{}', 'length', None), ('{}', 'stop', 'refused')])
def test_classifier_rejects_bad_output(content, finish, refusal):
    def create(**kwargs):
        assert kwargs['max_completion_tokens'] == 64
        assert kwargs['response_format']['json_schema']['strict']
        return SimpleNamespace(choices=[SimpleNamespace(finish_reason=finish, message=SimpleNamespace(content=content, refusal=refusal))])
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    with pytest.raises(ValueError):
        OpenAIClassifier(client).classify('text')


def test_failed_source_does_not_block_others(tmp_path):
    def respond(request):
        return httpx.Response(503 if request.url.host == 'bad.test' else 200, text=FEED)
    client = httpx.Client(transport=httpx.MockTransport(respond))
    sources = [{'id': 'bad', 'type': 'rss', 'url': 'https://bad.test/rss'}] + SOURCES
    stats = run(Database(tmp_path / 'news.sqlite3'), sources, client)
    assert stats['errors'] == 1
    assert stats['fetched'] == 1


def test_article_downloaded_only_once(tmp_path):
    calls = []
    def respond(request):
        calls.append(request.url.path)
        return httpx.Response(200, text=FEED if request.url.path == '/rss' else '<html><body><article><p>' + ('Это подробный текст новости. ' * 50) + '</p></article></body></html>')
    client = httpx.Client(transport=httpx.MockTransport(respond))
    db = Database(tmp_path / 'news.sqlite3')
    sources = [dict(SOURCES[0], fetch_articles=True)]
    assert run(db, sources, client)['fetched'] == 1
    assert run(db, sources, client)['fetched'] == 0
    assert calls.count('/1') == 1


def test_per_source_limit(tmp_path):
    feed = FEED.replace('</channel>', '<item><guid>two</guid><link>https://news.test/2</link><description>More</description></item></channel>')
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=feed)))
    stats = run(Database(tmp_path / 'news.sqlite3'), [dict(SOURCES[0], max_items=1)], client)
    assert stats['discovered'] == 1


def test_model_name_whitespace_is_trimmed(monkeypatch):
    monkeypatch.setenv('AI_MODEL', ' deepseek/deepseek-v4.1-flash ')
    assert OpenAIClassifier(client=object()).model == 'deepseek/deepseek-v4.1-flash'


def test_deepseek_disables_thinking_for_small_token_budget(monkeypatch):
    monkeypatch.setenv('AI_MODEL', 'deepseek/deepseek-v4.1-flash')
    def create(**kwargs):
        assert kwargs['extra_body'] == {'thinking': {'type': 'disabled'}}
        assert kwargs['max_completion_tokens'] == 64
        return SimpleNamespace(choices=[SimpleNamespace(finish_reason='stop', message=SimpleNamespace(content='{"topic":"business","severity":"none"}', refusal=None))])
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    assert OpenAIClassifier(client).classify('Company revenue grew') == {'topic':'business','severity':'none'}


def test_parallel_marking_preserves_usage_and_retries(tmp_path, monkeypatch):
    from threading import Barrier
    from backend.collectors.base import Item
    monkeypatch.setenv('AI_CONCURRENCY', '2')
    db = Database(tmp_path / 'parallel.sqlite3')
    for i in range(5):
        item = Item(str(i), f'https://test/{i}', str(i), 'Body')
        db.insert('test', item)
        db.fetched(i + 1, item)
    barrier = Barrier(2, timeout=5)
    class Classifier:
        model = 'fake'
        def classify_with_usage(self, text):
            barrier.wait()  # A serial implementation cannot pass this.
            error = ValueError('bad output') if text.startswith('1\n') else None
            return {'topic': 'business', 'severity': 'none'}, {'prompt_tokens': 10, 'completion_tokens': 2, 'total_tokens': 12}, error
    with httpx.Client() as client:
        stats = run(db, [], client, Classifier(), limit=4, run_id=7)
    assert stats['classified'] == 3 and stats['errors'] == 1
    assert db.usage(7)['total_tokens'] == 48
    assert db.usage(7)['requests'] == 4
    assert db.conn.execute('SELECT attempts FROM news WHERE id=2').fetchone()[0] == 1
    assert db.conn.execute('SELECT status FROM news WHERE id=5').fetchone()[0] == 'pending_classification'
    db.conn.close()
    reopened = Database(tmp_path / 'parallel.sqlite3')
    assert reopened.usage()['total_tokens'] == 48
    assert reopened.usage(8)['total_tokens'] == 0


def test_usage_retained_for_rejected_output():
    result = SimpleNamespace(usage=SimpleNamespace(prompt_tokens=20, completion_tokens=64, total_tokens=84),
        choices=[SimpleNamespace(finish_reason='length', message=SimpleNamespace(content='', refusal=None))])
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **kwargs: result)))
    labels, usage, error = OpenAIClassifier(client).classify_with_usage('text')
    assert labels is None and isinstance(error, ValueError)
    assert usage['total_tokens'] == 84


def test_live_progress_distinguishes_inflight_from_queue(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event, Lock
    from backend.collectors.base import Item
    monkeypatch.setenv('AI_CONCURRENCY', '2')
    path = tmp_path / 'progress.sqlite3'
    db = Database(path)
    for i in range(3):
        item = Item(str(i), f'https://test/{i}', str(i), 'Text')
        db.insert('test', item)
        db.fetched(i + 1, item)
    started, release, mutex = Event(), Event(), Lock()
    class Classifier:
        model = 'test'
        calls = 0
        def classify(self, text):
            with mutex:
                self.calls += 1
                if self.calls == 2:
                    started.set()
            assert release.wait(5)
            if text.startswith('1\n'):
                raise ValueError('invalid labels')
            return {'topic': 'business', 'severity': 'none'}
    def execute():
        worker_db = Database(path)
        try:
            with httpx.Client() as client:
                return run(worker_db, [], client, Classifier(), run_id=42)
        finally:
            worker_db.conn.close()
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(execute)
        try:
            assert started.wait(5)
            progress = db.progress(42)
            assert progress['phase'] == 'labeling'
            assert progress['counts']['running'] == 2
            assert progress['counts']['queued'] == 1
        finally:
            release.set()
        assert future.result(timeout=5)['classified'] == 2
    progress = db.progress(42)
    assert progress['phase'] == 'finished'
    assert progress['counts'] == dict(queued=0, running=0, completed=2, failed=1, interrupted=0)
    assert progress['items'][0]['topic'] == 'business'
    assert progress['items'][1]['topic'] is None
