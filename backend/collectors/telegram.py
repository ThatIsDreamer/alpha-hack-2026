import re
from bs4 import BeautifulSoup
from .base import Item, fetch


class TelegramCollector:
    def __init__(self, source, client):
        self.source, self.client = source, client
        if not isinstance(source.get('max_pages', 2), int) or not 1 <= source.get('max_pages', 2) <= 10:
            raise ValueError('max_pages must be between 1 and 10')
        if not re.fullmatch(r'[A-Za-z0-9_]+', source['channel']):
            raise ValueError('Invalid public Telegram channel')

    def discover(self):
        before = None
        seen = set()
        for _ in range(self.source.get('max_pages', 2)):
            response = fetch(self.client, f"https://t.me/s/{self.source['channel']}",
                                       params={'before': before} if before else {})
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            ids = []
            for block in soup.select('.tgme_widget_message[data-post]'):
                ref = block['data-post']
                channel, _, number = ref.rpartition('/')
                if channel.lower() != self.source['channel'].lower() or not number.isdigit():
                    continue
                ids.append(int(number))
                node = block.select_one('.tgme_widget_message_text')
                if ref in seen or node is None:
                    continue
                seen.add(ref)
                for br in node.find_all('br'):
                    br.replace_with('\n')
                text = node.get_text().strip()
                date = block.select_one('time[datetime]')
                views = block.select_one('.tgme_widget_message_views')
                if text:
                    yield Item(ref, f'https://t.me/{ref}', text=text,
                               published_at=date['datetime'] if date else None,
                               metadata={'views': views.get_text(strip=True) if views else None})
            if not ids or min(ids) == before:
                break
            before = min(ids)

    def hydrate(self, item):
        return item
