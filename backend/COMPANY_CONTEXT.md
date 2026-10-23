# Company context

Each imported company gets a `business_context` row with draft status, empty
user answers and revision 0. No model call or invented company description is
needed. The context API combines current synthetic dataset facts (industry,
OKVED, registration location, scale, products and foreign trade) with explicit
user answers about activities, counterparties, operating geography and priorities.
Dataset provenance includes its fingerprint; nonempty user answers include their
source and confirmation timestamp. Empty answers remain unknown. Historical
payment relationships continue to be calculated separately, without inferring
ownership, debt or current contracts.

## API and persistence

- `GET /api/businesses/{id}/context` reads the profile without AI calls.
- `POST /api/businesses/{id}/context` takes `version`, `description`,
  `counterparties`, `geography`, and `priorities`. All four answers are strings;
  empty strings are permitted. Limits are 1,500 / 1,000 / 1,000 / 1,000 characters.
- A successful save confirms the context and increments its revision. A stale
  revision returns 409 instead of overwriting a concurrent edit. Unknown fields,
  wrong types and oversized input return 422 without changing persisted data.
- Existing databases are backfilled at startup without replacing onboarding data.
  User answers, revisions and timestamps survive atomic seed replacements.
  System facts are rebuilt from the current seed, with its new fingerprint.

The company selection remains browser-local. As elsewhere in this synthetic MVP,
context is shared per company; there is no user authentication or access control.

## UI

The first step shows known facts and four optional clarification questions. Users
can confirm known facts with all answer fields empty. The second step retains the
existing source picker. Companies with saved sources but no confirmed context see
the new context step once; source preferences remain intact. «Контекст компании»
in the newsroom opens the inline editor, with save/cancel and failure states.
Switching companies unmounts forms and cancels old reads. Nothing is persisted
until an explicit save; context and source preferences are saved separately.

## Recommendations

Confirmed answers contribute keyword stems to news ranking within the existing
industry/partner topic and source boundaries. They are included in the model input
as user statements, separate from dataset facts. Draft answers are ignored.
The prompt requires unknowns to stay unknown, conflicts to be clarified and all
context/news to be treated as untrusted data rather than instructions.

The cache key includes the full context, revision, provenance, dataset fingerprint
and prompt version. Editing the context invalidates reuse automatically. Each new
generated result records `context_version` and `context_snapshot`, so subsequent
edits do not rewrite its provenance. Existing source/service validation remains.

Local verification uses fake model responses; it does not spend production AI
credits or change the production databases. Deploying or pushing is a separate step.
