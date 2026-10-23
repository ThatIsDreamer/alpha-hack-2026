from .rss import RSSCollector
from .telegram import TelegramCollector
from .website import WebsiteCollector

COLLECTORS = {'rss': RSSCollector, 'telegram': TelegramCollector, 'website': WebsiteCollector}
