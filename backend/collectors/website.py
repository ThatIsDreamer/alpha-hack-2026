from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup
import trafilatura
from .base import Item, fetch


def extract_article(html):
    return trafilatura.extract(html, include_comments=False, include_tables=False) or ''


class WebsiteCollector:
    def __init__(self, source, client):
        self.source, self.client = source, client

    def discover(self):
        response = fetch(self.client, self.source['url'])
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        seen = set()
        for link in soup.select(self.source['link_selector']):
            url = urljoin(self.source['url'], link.get('href', '')).split('#')[0]
            if urlsplit(url).netloc != urlsplit(self.source['url']).netloc or url in seen:
                continue
            seen.add(url)
            yield Item(url, url, title=link.get_text(' ', strip=True))

    def hydrate(self, item):
        response = fetch(self.client, item.url)
        response.raise_for_status()
        item.text = extract_article(response.text)
        if not item.text:
            raise ValueError('No article text extracted')
        return item
