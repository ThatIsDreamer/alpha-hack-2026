# Company recommendations

## Data audit (2026-10-23)

All 85,513 imported companies have an industry name and OKVED code. There were no
company labels matching the news taxonomy before this change. `business_topics.py`
introduces the explicit `okved-news-v1` relevance mapping, persisted for every
company in `business_categories`, migrated at startup without replacing mutable
onboarding data. The mapping is a product heuristic, not an official equivalence:
all known industries include business/economy/law, and relevant divisions add
technology, science, health, environment, culture, sports, society or politics.
Original OKVED/name remains in the prompt to distinguish businesses sharing broad
labels. Missing or invalid codes map to `other`, never an inferred industry.

The payment graph contains 177,309 unique IDs; 114,553 have no company profile.
For each selected company both incoming and outgoing flows are aggregated, with
all known partner divisions sent to the model and the 12 largest known partners
included as examples. Unknown counts and known turnover coverage are explicit.
Payment links are historical, not ownership, arrears or current contract evidence.

## Request contract

- GET `/api/recommendations`: company context, eligible sources, candidate count,
  cached result, and AI availability; never calls the model.
- POST `/api/recommendations`: returns cached output or generates recommendations.
- Both require `X-Business-ID` and completed onboarding. Optional `source`, `topic`,
  `severity` filters intersect enabled saved sources and own/partner topic labels.
- Up to 30 classified, nonempty articles from the past 30 days, selected from the
  newest 500 by industry keyword and macro/regulatory relevance, each capped
  at 2,000 characters. No fallback to unselected sources or unrelated categories.
- Exactly 3 distinct service actions on success, or an explicit insufficient-data
  state. Unknown citation IDs, unknown services, duplicate services, truncated
  responses and unconfirmed foreign-trade recommendations are rejected.
- The model receives untrusted news as data. Titles, URLs and source identities
  are hydrated by the server from allowed evidence IDs, never model-generated.
- Service facts live in `alfa_services.json`, researched from official Alfa pages
  on 2026-10-23. Each action includes its official service reference. No invented
  authenticated deep links or actual banking operations. Rates/approval/available
  balances are not supplied and must not be invented.
- Model credentials/base URL/model reuse existing AI configuration. Output capped
  at 2,200 tokens; thinking disabled for DeepSeek; no automatic provider retries.
- Cache key covers company, relationships, selected sources, filters, article
  content, model, category/prompt/catalog versions. TTL one hour, persisted in news
  DB. Source edits and company switches cannot reuse another context's response.
- Single-process generation lock, one new model call per company per minute.
  Usage (including validation failures) goes into existing `ai_usage`, with
  purpose=recommendation, business_id, news_id=0 sentinel and no run_id. Existing
  totals include recommendations. API transport failures record unknown usage.

## UI

`/news` is the company recommendation workspace. Generation is explicit and
cached results load automatically. Company/filter changes abort display of stale
responses. Source and service citations open original websites. News/runs remain
available at `/debug/news` and `/debug/runs` (legacy `/runs` still works), without
navigation links. Debug routes are hidden navigation, not access control. This
MVP still has synthetic identities selected locally; there is no authentication.
