from datetime import datetime, timezone
from calendar import timegm
import feedparser
from bs4 import BeautifulSoup
from .base import Item, fetch
from .website import WebsiteCollector


class RSSCollector(WebsiteCollector):
    def discover(self):
        response = fetch(self.client, self.source['url'], verify_tls=self.source.get('verify_tls', True))
        response.raise_for_status()
        feed = feedparser.parse(response.content)
        if feed.bozo and not feed.entries:
            raise ValueError('Invalid or empty malformed feed')
        for entry in feed.entries:
            url = entry.get('link', '')
            identity = entry.get('id') or url
            if not identity or not url.startswith(('https://', 'http://')):
                continue
            content = entry.get('content', [])
            custom_content = entry.get(self.source.get('content_field', ''), '')
            html = custom_content or (content[0].get('value', '') if content else entry.get('summary', ''))
            date = entry.get('published_parsed') or entry.get('updated_parsed')
            yield Item(identity, url, entry.get('title', ''),
                       BeautifulSoup(html, 'html.parser').get_text(' ', strip=True),
                       datetime.fromtimestamp(timegm(date), timezone.utc).isoformat() if date else None,
                       {'text_kind': 'feed_content' if (custom_content or content) else 'feed_summary'})

    def hydrate(self, item):
        if self.source.get('fetch_articles', True):
            # A failed article fetch remains pending; do not silently classify a teaser.
            super().hydrate(item)
            item.metadata['text_kind'] = 'article'
        if not item.text:
            raise ValueError('Empty feed text')
        return item
