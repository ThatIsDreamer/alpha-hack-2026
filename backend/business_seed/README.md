# Synthetic business seed

These gzip files are lossless copies of the three user-supplied semicolon-delimited UTF-8 CSVs.
The originals remain in the user's workspace. The source guide is
`Альфа_хакатон_разбор_данных.docx` (21 October 2026).

The API imports them on startup into a **separate** SQLite database. `BIZ_DB`
defaults to `businesses.sqlite3` beside `NEWS_DB`, so Railway uses the existing
persistent `/data` volume. The database is approximately 239 MiB. A changed seed
is built in a temporary file and atomically replaces the prior database only
when complete; allow room for both copies during an update. A content hash and
schema version make unchanged startups skip the import. Do not commit SQLite files.

Manual import: `BIZ_DB=/path/businesses.sqlite3 python -m backend.businesses`.

Import rules:
- Exclude the duplicate placeholder `U_428697` (12 source rows).
- Preserve synthetic IDs; the dataset has no real company names. UI labels must
  not invent names. Search supports IDs, group IDs, industry/OKVED, city and region.
- Normalize OKVED trailing zeroes, split country lists, use FNS employee ranges.
- Preserve original company fields in `raw_profile`; missing flags stay null.
- Keep group membership and group revenue totals separate from legal-entity revenue.
- Exclude self-payments; merge repeated payer/beneficiary pairs by sum/count.
- Store money as integer kopecks. API monetary fields are rubles.
- Keep unknown counterparties and report known-counterparty turnover coverage.
- Retain person links as supplemental data, not as inferred ownership.

Verified import: 85,513 companies, 18,091 nonempty groups, 1,353,162 cleaned
payment pairs, 12,514 person-company links. The difference from the guide's
18,092 groups follows exclusion of the placeholder company.

## API

- `GET /api/businesses?q=Москва&limit=20&offset=0`: list/search, maximum 50 results
  per page. The guide's eight demo profiles appear first, then stable ID ordering.
- `GET /api/businesses/{id}`: normalized company profile, group summary, products,
  countries, payment totals/coverage, linked-person count, original fields.
- `GET /api/business-groups/{id}?limit=20&offset=0`: group totals and paged members.

Selection is stored only in browser localStorage under `alfa.selected-business-id`.
There is no API endpoint/session state for setting a selected company.
Recommendation calls use `recommendationRequest` in
`front/src/lib/api.ts`, which reads the current selection for each request and
sends `X-Business-ID`. The recommendation API uses `Depends(recommendation_business)` on its
FastAPI handlers to validate the ID and load its profile/group context. CORS
allows this header. GET/POST `/api/recommendations` are implemented; see `backend/RECOMMENDATIONS.md`.
This context is a demo preference, not an authentication or authorization mechanism.

## Company onboarding

- `GET /api/businesses/{id}/onboarding` returns `completed`, `source_ids`,
  `completed_at`, `updated_at` and the configured source catalog.
- `POST /api/businesses/{id}/onboarding` with `{"source_ids":["lenta","kommersant"]}`
  validates and deduplicates IDs, saves the preference and completes onboarding
  atomically. At least one known source is required. Later submissions edit the
  preference while retaining the original completion timestamp.
- Profile detail also includes `onboarding`. Companies without a persisted row
  have `completed: false`. Settings belong to the company, not the browser.
- `business_onboarding` lives in the same persistent business DB. Startup creates
  the table for existing databases without rebuilding the dataset; seed updates
  copy these mutable settings before the atomic file replacement.
- Recommendations use enabled saved sources as a mandatory filter. Ingestion and
  the debug news listing remain global. Disabled sources are labelled in the UI and can be stored as future
  preferences; this does not enable collection from them.

The selected company remains local. For an incomplete company, the frontend
replaces the main workspace with source onboarding until a successful save;
the Alfa header/sidebar remain available. Completed companies can edit sources
from the company selector, using the same inline workspace.
