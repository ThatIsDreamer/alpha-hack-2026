"""Railway cron entrypoint; fail closed if persistent storage is not mounted."""
import os
import sys
from pathlib import Path
from .main import main


def configure():
    mount = os.getenv('RAILWAY_VOLUME_MOUNT_PATH')
    if os.getenv('RAILWAY_ENVIRONMENT_ID'):
        if not mount or not Path(mount).is_dir():
            raise RuntimeError('Attach a Railway volume before running ingestion')
        database = Path(os.environ.get('NEWS_DB', '/data/news.sqlite3')).resolve()
        if not database.is_relative_to(Path(mount).resolve()):
            raise RuntimeError('NEWS_DB must be inside the persistent volume')
    if not (os.getenv('OPENAI_API_KEY') or os.getenv('AI_API_KEY')):
        print('No AI credentials configured: collecting text only; classification remains pending.', flush=True)
        sys.argv.append('--scrape-only')


if __name__ == '__main__':
    configure()
    main()
