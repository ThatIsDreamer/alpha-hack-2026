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

## Local demo and FastAPI

```sh
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python -m backend.serve
# In another terminal:
cd front
npm ci
npm run dev
```

Open http://localhost:5173; API docs are at http://localhost:8000/docs.
The frontend defaults to the local API; set VITE_API_URL for another endpoint.
The API defaults to the persistent local database backend/data/news.sqlite3.
Set ENABLE_SCHEDULER=false for local tests without hourly collection.

Endpoints: GET /health, /api/overview, /api/news (source, limit, offset),
/api/news/{id}, /api/runs; POST /api/runs starts a bounded demo job.
Demo jobs discover at most 5 entries per enabled source, fetch at most 5 articles,
and have a global persisted five-minute cooldown. With configured credentials they classify at most 5 pending articles per run.
Run history records real counts and failures, and interrupted runs on restart.

## Railway deployment

Both services deploy from ThatIsDreamer/alpha-hack-2026 main via GitHub.
- API: https://alpha-hack-2026-production.up.railway.app
- Frontend: https://newsroom-web-production-32f5.up.railway.app
- API service: 64d3cbb9-e4eb-4397-9fac-d1a7de63f756; root checkout Dockerfile.
- Frontend service: c547e564-f7e4-4a52-b333-0cd322b4286b; root directory /front.
- Project: 76ae1d1a-80ef-4246-8ff8-c26f56328361
- Production environment: 4d02dfe0-c018-4fb4-a778-53f62da533ab
- Existing volume: 5ffcfdc9-3697-4656-9630-89dd87b76b20 at /data (5 GB).

The API is now always on and owns the hourly scheduler. Railway's old cron schedule
must be disabled; start command is python -m backend.serve. Exactly one process and
one replica must run against this SQLite volume. Runs use the same OS lock as the CLI.
The hourly scheduler fires at the next UTC hour and skips if another run is active;
it does not backfill missed hours during downtime. Existing articles remain in
/data/news.sqlite3. A shared database/job queue is needed before scaling replicas.

API variables: PORT=8000, NEWS_DB=/data/news.sqlite3, CORS_ORIGINS set to the frontend
origin plus http://localhost:5173. AI_API_KEY (or OPENAI_API_KEY), AI_BASE_URL and
AI_MODEL enable scheduled classification; without credentials only text is collected.
Frontend build variable: VITE_API_URL points to the public API domain. It is not a secret.
The frontend Dockerfile builds Vite and serves SPA fallback routes with nginx on 8080.

## Additional source coverage

Configured once each: RBC, Rosstat, MOEX, Bank of Russia, official legal publications,
Vedomosti, World Bank Commodity Markets press releases, and GDELT Russian-language
coverage. Kommersant was already present and has not been duplicated. Added public
Telegram channels: bazabazon, forbesrussia, b_retail, svobodakassa, domostroy_channel,
centralbank_russia, banksta; bankrollo remains enabled. A website and its Telegram
channel are separate origins; URL uniqueness still prevents identical article URLs
from being stored twice across feeds.

- All new sources have max_items=50; Telegram has max_pages=2.
- RBC's `rbc_news_full-text` and MOEX's content:encoded supply text directly from RSS.
- Rosstat alone has `verify_tls:false`, explicitly authorized for its certificate.
  The opt-out uses a separate HTTP client; other sources retain TLS verification.
- Pravo uses its working official HTTP RSS endpoint. Only publication metadata and
  titles are ingested, not the full legal text or scanned PDFs.
- World Bank covers commodity-market press releases, not XLS price series or PDF reports.
- Vedomosti collection is limited to publicly accessible article text.
- GDELT uses official DOC 2.0 RSS: sourcelang:russian, all topics, past hour, newest
  first, maximum 50 links. It is a bounded sample, not exhaustive Russian coverage.
  Live local verification returned HTTP 429; hourly runs retry discovery normally,
  without immediate retry loops. A failed source does not stop other collectors.

Model names are trimmed before requests. For DeepSeek models, thinking is explicitly
disabled so the 64-token budget goes to the two labels rather than reasoning.
Demo runs now classify up to 5 pending items when model credentials are configured;
the persisted five-minute cooldown and one-run-at-a-time lock still apply.
