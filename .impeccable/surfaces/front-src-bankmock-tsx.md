---
version: 1
slug: "front-src-bankmock-tsx"
primary_target: "front/src/BankMock.tsx"
related_targets: ["front/src/BankMock.css"]
---

# Main banking mock

Mode: Operate. Route `/`; news remains on `/news`, article detail on `/news/:id`, and run history on `/runs` with their existing design intact.

## Authority and scope

The user supplied a 1280×720 Alfa-Business screenshot and explicitly requested reproduction of its sidebar, header, and action buttons using Hugeicons and shadcn, with the entire workspace represented by static skeletons. Current explicit Russian instructions override older PRODUCT.md assumptions. No authentication or financial operations are included.

## Direction contract

THESIS: Reproduce the supplied banking shell as a demo, with the central workspace entirely represented by static placeholders.
OWN-WORLD: Cool pale gray canvas, compact Russian Arial/Helvetica typography, 200px desktop navigation, supplied red Alfa mark, outline icons, white rounded actions. Exact route-specific tokens live in DESIGN.md and are extracted from BankMock.css.
STORY: A visitor recognizes the banking shell; banking controls explain the demo limitation. Ньюсрум provides direct access to the real news interface.
FIRST VIEWPORT: A 48px header; sidebar below it; main x=240px; actions y=58px; summary y=122px and 372px tall. Current CSS places tabs at y=525px and lower panels at y=577px, superseding the earlier planned y=530px/y=578px. Settings remain bottom-left and chat bottom-right.
FORM: User-pinned screenshot reproduction, code-led. No concept tournament or generated raster assets. Source identity asset: user-supplied PNG at front/src/assets/alfa-logo.png; rendered at 32px desktop and 30px mobile. Reference screenshot is user-provided; no repository screenshot path is asserted.
FINISH: Prior screenshot received reviewer verdict “ship” at static-mock scope with no material findings, as supplied in the implementation handoff. This documentation pass inspected source and does not claim a new visual review of the latest navigation edit.

## Final navigation correction

The implemented first sidebar item is Ньюсрум, an actual link to `/news`, carrying the НОВОЕ badge. Заявки has no badge. All remaining banking service buttons retain demo feedback. The “Все сервисы” dialog also contains an “Обзор новостей” link.

## Behavior and responsive boundaries

Skeletons do not animate and do not imply an active load. Summary, tab strip, and all lower panels remain placeholders. Keep demo copy, the skip link, labeled icon controls, visible focus, and aria-expanded menu state. Banking dialogs explicitly state that operations are unavailable.

At <=1100px, hide the summary card and promo placeholders and use two columns. At <=760px, use a 58px sticky header, toggleable 215px sidebar with backdrop, two-column actions, and a single-column reduced workspace. News retains its separate 700px breakpoint.

## Documentation evidence

Read BankMock.tsx, BankMock.css, App.tsx route definitions, App.css, and index.css. Documentation only: no source changes, no commit, no new browser verification. Existing news styling is preserved as an independent system rather than reinterpreted through the Alfa palette.
