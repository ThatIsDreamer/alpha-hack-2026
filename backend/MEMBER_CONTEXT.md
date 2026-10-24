# Multi-user Newsroom onboarding

The supplied hackathon brief (target audience, page 5) defines seven decision-maker
roles and explicitly says the service is for people, not legal entities. The local
prototype now uses the following flow on `/news`:

1. Select one demo employee within the selected company.
2. Choose one primary role: owner, CEO, CFO, chief accountant, treasury head,
   another C-level executive, or another employee involved in decisions.
3. See a personal feature introduction once per employee/company pair.
4. Conduct an adaptive interview (up to six questions) that combines dataset facts,
   the approved shared company context, the selected role and only this member's
   own confirmed answers. Subsequent employees refine existing company knowledge
   in their area of responsibility rather than starting the company interview over.
5. Review company suggestions separately from personal tasks and interests.
6. Confirm personal answers; send changed shared fields as a proposal. Select
   company news sources if the first employee has not done so yet.
7. Generate recommendations using approved company context + the selected member's
   role and personal context. Source preferences remain common to the company.

## Storage and review

- `company_members` is keyed by `(business_id, member_id)`. It stores one role,
  private `personal_tasks`/`personal_focus`, revision, personal confirmation and
  introduction acknowledgment. Changing role invalidates personal confirmation
  and unfinished sessions while retaining previous private answers for refinement.
- `context_dialogues.member_id` isolates drafts, messages and evidence by member.
  Legacy company-only conversations remain isolated under an empty member ID;
  they are not assigned to the first demo employee or exposed to new employees.
- The model outputs updates for six explicit fields. The first four are proposed
  company facts; the last two are private personal context. Quote validation checks
  actual user messages. Users inspect both scopes before confirming.
- `context_proposals` stores only changed company fields, original company version,
  author/role, decision, reviewer and timestamps. Neither the private answers nor
  the private transcript are included in the responsible person's review API.
- All company changes require review, including changes suggested by the responsible
  employee. Reviewing permission is independent of job role. In this demo employee 1
  is responsible; employees 2 and 3 may submit suggestions. Any of them may choose
  any of the seven roles.
- Approval merges the patch into the current shared context only when its base
  version is still current. A stale patch receives 409, remains pending, and can
  be rejected and re-created through a new interview. Rejection leaves shared
  context intact. Concurrent reviews use `BEGIN IMMEDIATE` and single-use status.
- For companies using member profiles the legacy direct company-context save API
  rejects writes, including requests that omit the demo header.
- Member profiles, conversation ownership and proposals survive dataset reseeding.

## API

Member endpoints require `X-Demo-User-ID` (`member-1`, `member-2`, `member-3`):

- `GET /api/businesses/{company}/member-context` returns only the selected member's
  private profile, plus public demo identities and the role catalogue.
- `POST .../member-context/role` takes one role and expected personal `version`.
- `POST .../member-context/welcome` acknowledges this employee's introduction.
- Existing `.../context/dialogue` endpoints use the header to scope all operations.
  Session IDs alone never authorize reading, answering, revising or confirming a
  different employee's conversation.
- `POST .../member-context/confirm` takes `dialogue_id` and `revision`. The server
  reads the ready, owned draft; it does not trust a client-provided company patch.
- `GET .../context/proposals` returns all suggestions for the responsible employee,
  or only the selected author's own suggestions for other employees.
- `POST .../context/proposals/{id}/review` takes `action` (approve/reject) and
  expected shared-context `version`; approval is restricted to the responsible.

Recommendations additionally require `X-Business-ID`. The member ID, primary
role, personal answers/revision and approved company revision are in model input
and cache fingerprint. Personal keyword matches and a soft role emphasis influence
news ranking within the existing company/source boundaries. Role never proves
that the company needs a product. A recommendation records the exact private and
shared context snapshots that produced it. Another member cannot receive it via
cache reuse. The existing per-company spend cooldown remains shared.

## Demo boundary and production integration

The explicit demo identity header and employee switcher are simulated accounts,
not authentication or production privacy protection: a person can deliberately
switch identities in the demo. Production must derive employee/company membership
and review permissions from an authenticated bank session, remove the client-driven
identity switcher, and enforce authorization on every API (including legacy routes).
UI role selection controls relevance only; it never grants review permission.
Private profiles/transcripts must be access-controlled, encrypted under the bank's
policy, retained according to policy and excluded from other employees' AI input.
Company proposal decisions provide a persisted review audit; production must also
attach authenticated actors and instrument all model/tool access in the audit log.

## Validation

Regression tests cover existing company-only flows, role-first gating, one-role
validation, CORS for member headers, per-company/member isolation, foreign-session
rejection, personal-data exclusion from shared review, independent responsibility,
stale approvals, rejection, direct-save bypass prevention, role changes, role/task
ranking, distinct personal cache fingerprints, and seed migration preservation.
The live model smoke test uses the existing configured approved-model proxy.
