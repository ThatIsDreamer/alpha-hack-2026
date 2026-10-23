import sys
import pytest
from backend.railway_job import configure


def test_requires_volume_on_railway(monkeypatch):
    monkeypatch.setenv('RAILWAY_ENVIRONMENT_ID', 'production')
    monkeypatch.delenv('RAILWAY_VOLUME_MOUNT_PATH', raising=False)
    with pytest.raises(RuntimeError, match='Attach a Railway volume'):
        configure()


def test_rejects_database_outside_volume(monkeypatch, tmp_path):
    monkeypatch.setenv('RAILWAY_ENVIRONMENT_ID', 'production')
    monkeypatch.setenv('RAILWAY_VOLUME_MOUNT_PATH', str(tmp_path))
    monkeypatch.setenv('NEWS_DB', '/tmp/ephemeral.sqlite3')
    with pytest.raises(RuntimeError, match='inside the persistent volume'):
        configure()


def test_collects_without_credentials(monkeypatch, tmp_path):
    monkeypatch.setenv('RAILWAY_ENVIRONMENT_ID', 'production')
    monkeypatch.setenv('RAILWAY_VOLUME_MOUNT_PATH', str(tmp_path))
    monkeypatch.setenv('NEWS_DB', str(tmp_path / 'news.sqlite3'))
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('AI_API_KEY', raising=False)
    monkeypatch.setattr(sys, 'argv', ['railway_job'])
    configure()
    assert '--scrape-only' in sys.argv
