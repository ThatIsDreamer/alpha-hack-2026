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

The welcome mascot introduces the newsroom, with an option to go straight to
company setup. The next step opens a chat with the mascot: assistant/user message bubbles,
a scrollable transcript, optimistic user messages, a thinking state, and a compact
composer (Enter sends, Shift+Enter adds a newline). Users can confirm known
facts with all answer fields empty. The final step retains the existing source
picker with the mascot. The sequence is welcome → context → sources.
Once context is confirmed, reloading an unfinished setup resumes at sources.
Companies with saved sources but no confirmed context see
the new context step once; source preferences remain intact. «Контекст компании»
in the newsroom opens the inline editor, with save/cancel and failure states.
Switching companies unmounts the chat and cancels old reads. Conversation drafts
persist automatically; only explicit confirmation updates company context.
Context and source preferences are saved separately.

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
The refreshed recommendation flow and shake gesture use `refresh=true` to bypass
the cached result; they still use the current company context and retain the
generation lock and per-company cooldown.

Local verification uses fake model responses; it does not spend production AI
credits or change the production databases. Deploying or pushing is a separate step.

## Managed interview

- GET `/api/businesses/{id}/context/dialogue` resumes the unconfirmed session for
  the current context revision, or returns null. It never calls AI.
- POST `.../dialogue/start` creates or resumes a persisted session. No AI call.
- POST `.../dialogue/answer` takes `dialogue_id`, `revision`, `answer`, `skip`.
  A normal answer invokes the configured model once; skipping never invokes it.
- The server owns the four-block sequence: activities, counterparties, operating
  geography, priorities. Already populated blocks are not asked again; when all
  are populated, the interview revisits current priorities. There are at most
  four main questions plus two model-proposed clarification turns.
- The model extracts a field value, exact user-message citations, and an optional
  clarification question as structured JSON. Unknown IDs, nonmatching quotes,
  wrong-field evidence, oversized values, refusal, truncation and malformed
  output are rejected. Quotes establish traceability, not semantic truth; the
  user must still review the proposed wording before confirmation.
- `context_dialogues` stores history, extracted draft, evidence and revision.
  Successful turns persist atomically. Provider failures leave the prior
  transcript/draft intact; the chat keeps the unsent answer in its composer for retry.
  Sessions survive restarts and seed replacements. Company switches unmount the
  conversation and abort client requests. Stale turns/context revisions return
  409. An in-process lock and two-second per-session attempt cooldown bound spend;
  failed provider attempts also count toward the cooldown. No automatic retries.
- Completing the interview does not update the confirmed profile. A final mascot
  message displays the proposed context and expandable source quotes. Confirmation uses the usual
  context POST with `dialogue_id`; unfinished, foreign-company and stale sessions
  cannot be confirmed. Matching extracted values receive `user_confirmed_ai`
  provenance with evidence. Direct API edits retain `user` provenance.
  Until confirmation, recommendations continue using the old context.
- The UI has no multi-field form or form fallback. «Уточнить» under a summary
  block calls POST `.../dialogue/revise` with `dialogue_id`, `revision`, `field`.
  The server reopens that block as a new chat question, preserving history. Up to
  four user-initiated correction rounds are allowed per session, in addition to
  the initial interview. Latest corrections supersede earlier wording and carry
  new validated evidence. Revision/company/confirmed-state guards also apply.
  Confirmation remains inside the chat.
- AI config reuses `AI_API_KEY`/`OPENAI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`.
  API startup reads the local `.env` without overriding existing environment
  variables. No key is embedded in the frontend. Without a key the UI explicitly
  disables model answers and offers skipping or returning later; no synthetic AI
  conversation is presented. Provider usage is recorded as purpose `company_context`, included
  in the service-wide usage totals. Timeout is 45 seconds, max retries 0, output
  cap 900 tokens, and DeepSeek thinking is disabled as in existing integrations.

For isolated tests, use `LOAD_ENV_FILE=false AI_API_KEY= OPENAI_API_KEY= .venv/bin/python -m pytest backend/tests -q` so local provider credentials are never loaded.
