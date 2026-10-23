# News ingestion

Python 3.11+; SQLite; RSS-first ingestion with separate website and public Telegram adapters.
Run from the repository root:

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cp .env.example .env
# Set a real AI_API_KEY (or OPENAI_API_KEY), AI_BASE_URL and AI_MODEL in .env.
.venv/bin/python -m backend.main --scrape-only --limit 5
.venv/bin/python -m backend.main --limit 100
.venv/bin/python -m pytest backend/tests -q
```

The example key is a placeholder. The configured OpenAI-compatible proxy must support
Chat Completions, `max_completion_tokens`, and strict JSON schema. Compatibility and
model availability must be tested with real credentials. For direct OpenAI, omit
AI_BASE_URL. No fabricated labels are saved in scrape-only mode.

## Sources and adapters

Edit `backend/sources.json`. IDs must remain stable. The initial Lenta and Kommersant
feeds come from https://github.com/plenaryapp/awesome-rss-feeds/blob/master/countries/without_category/Russia.opml.
This is a curated starter subset, not an automatic subscription to the entire list.

- `rss`: `url`, `fetch_articles` (default true). Feed entries discover IDs and metadata;
  only unseen articles are downloaded. Setting false explicitly opts into classifying
  feed text, which can be only a summary. `metadata.text_kind` records the distinction.
- `telegram`: `channel` without @, `max_pages` (default 2, maximum 10). Reads public t.me/s HTML,
  preserves post IDs, dates, views and text. Media-only posts are skipped. Enable the
  example or add your chosen channels. Pagination is bounded: high-volume channels
  may need more pages, and this is not a complete historical archive.
- `website`: `url` (listing page), `link_selector` (CSS selector identifying article
  links). Only same-host links are followed; article text uses trafilatura. Example:
  `{"id":"example","type":"website","url":"https://example.com/news","link_selector":"article h2 a"}`.

New adapters implement `discover()` and `hydrate(item)` and register in
`collectors/__init__.py`. Discovery yields normalized Item objects. This interface
can also accept future API or agent-based collectors without changing persistence.
Feeds and public listing pages are rechecked each run; saved article bodies and
successful classifications are not fetched again. Changed existing posts are not
re-ingested. Exact source-ID/external-ID and URL constraints deduplicate records;
syndicated copies with different URLs are not semantically deduplicated.

## Storage and classification

Default database: `backend/data/news.sqlite3`. Raw discoveries are committed before
article fetching, then text is committed before classification. States are
`pending_fetch`, `pending_classification`, `classified`. Failures retain raw content
and an error, retry up to five times over subsequent runs, and do not stop other
sources. To retry exhausted work after fixing its cause:

```sql
UPDATE news SET attempts=0, last_error=NULL WHERE status != 'classified';
```

`--limit` bounds each fetch/classification stage per run (default 100); discovery
is capped at 50 items per source (`max_items`, configurable from 1 to 500). Classification prioritizes fewer attempts to
avoid failed records starving fresh ones. Model input is capped at 12,000 characters;
output is capped at 64 tokens, strict JSON containing just `topic` and `severity`.
Model and classifier version are stored alongside labels. Source text is untrusted
input. Topic labels are defined in classifier.py; severity is:

- none: neutral/favorable
- low: mild criticism/minor setback
- moderate: substantial criticism, failure or alleged misconduct
- high: alleged serious crime, corruption, major scandal or grave harm
- unclear: ambiguous subject or insufficient context

Severity describes the portrayal of the main subject, not independently verified
wrongdoing. Multi-subject articles receive one overall label; subject-specific
classification would need a separate entity extraction step. Classification failure,
refusal or truncation never produces a success record.

## Hourly cron

Install this on the host running the backend, replacing both absolute paths:

```cron
0 * * * * cd /absolute/path/to/alpha-hack-2026 && /absolute/path/to/alpha-hack-2026/.venv/bin/python -m backend.main >> /absolute/path/to/news-ingestion.log 2>&1
```

This runs on the hour in the host timezone. The CLI exits nonzero if any work fails,
while committing successful work. An OS file lock prevents overlapping runs against
the same DB on one host and releases automatically after crashes. Use persistent
storage and one host for SQLite; distributed workers need a shared database and
job claims. Cron installation is deliberately left to the runtime host; running a
local test does not install a background process. Configure log rotation on that host.

## API reference

Classifier schema follows https://developers.openai.com/api/docs/guides/structured-outputs.

## Railway

The root Dockerfile builds only the Python backend. `railway.json` runs it hourly
(`0 * * * *`, UTC), with one replica and no automatic restart after completion.
Attach a persistent Railway volume at `/data`; `NEWS_DB=/data/news.sqlite3` is the
container default. The Railway entrypoint refuses to run without a volume or if
the database path is outside its mount. SQLite's database, WAL, and lock files all
live on that volume and survive redeployments. No public domain is needed for this
scheduled worker.

Set AI_API_KEY (or OPENAI_API_KEY), AI_BASE_URL if using a proxy, and AI_MODEL as
Railway service variables. Without an API key the worker collects and persists text
only, leaving classification queued until credentials are configured. The example
.env file is not copied into the image. The Railway service deploys from `ThatIsDreamer/alpha-hack-2026`, branch `main`.
Pushes to that branch trigger GitHub-backed deployments.

Deployment created for this repository:
- Project: `76ae1d1a-80ef-4246-8ff8-c26f56328361`
- Production environment: `4d02dfe0-c018-4fb4-a778-53f62da533ab`
- Worker service: `64d3cbb9-e4eb-4397-9fac-d1a7de63f756`
- Volume: `5ffcfdc9-3697-4656-9630-89dd87b76b20`, mounted at `/data` (5 GB).

The hourly schedule and NEVER restart policy are also set directly on the Railway
service. Railway warns that legacy railway.json support ends on 2026-12-01; these
server-side settings remain configured independently of that file.
