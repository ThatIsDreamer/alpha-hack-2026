---
name: Alfa shell and news demo
description: Shared Alfa shell with an integrated live newsroom.
colors:
  news-background: "#ffffff"
  news-text: "#202020"
  news-secondary: "#666666"
  news-border: "#e5e5e5"
  news-link: "#2563eb"
  alfa-canvas: "#f3f4f5"
  alfa-text: "#252629"
  alfa-navigation-text: "#26272a"
  alfa-muted: "#73767b"
  alfa-white: "#fff"
  alfa-focus: "#ef3124"
  alfa-new: "#329af5"
  alfa-summary: "#e8e9ec"
  alfa-panel: "#f9f9fa"
  alfa-skeleton: "#e5e6e9"
  alfa-hover: "#e7e8eb"
  alfa-more: "#e9eaed"
  alfa-chat: "#202123"
typography:
  news-heading:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.17
    letterSpacing: "-.035em"
  news-body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  alfa-body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "13px"
    lineHeight: 1.4
  alfa-navigation:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  alfa-action:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  alfa-badge:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "8px"
    fontWeight: 600
    lineHeight: "16px"
rounded:
  news-button: "6px"
  alfa-navigation: "6px"
  alfa-action: "10px"
  alfa-summary: "20px"
  alfa-panel: "15px"
  alfa-lower-panel: "16px"
  alfa-skeleton: "5px"
  alfa-badge: "4px"
spacing:
  news-desktop-gutter: "48px"
  news-mobile-gutter: "20px"
  alfa-action-gap: "10px"
  alfa-summary-gap: "12px"
  alfa-lower-gap: "20px"
  alfa-mobile-gutter: "16px"
components:
  alfa-action:
    backgroundColor: "{colors.alfa-white}"
    typography: "{typography.alfa-action}"
    rounded: "{rounded.alfa-action}"
    height: "38px"
    padding: "0 17px"
  alfa-more:
    backgroundColor: "{colors.alfa-more}"
    rounded: "{rounded.alfa-action}"
    height: "38px"
    padding: "0 19px"
  alfa-new-badge:
    backgroundColor: "{colors.alfa-new}"
    textColor: "{colors.alfa-white}"
    typography: "{typography.alfa-badge}"
    rounded: "{rounded.alfa-badge}"
    padding: "0 5px"
    height: "16px"
---

# Design System: Alfa shell and news demo

## Overview

One Alfa layout now contains `/`, `/news`, `/news/:id`, and `/runs`. The newsroom is an MVP tab within the banking website, with live data, Russian controls, and original-language source text.

The approved `/` surface reproduces the user-supplied Alfa-Business screenshot: compact Russian banking chrome surrounding a completely static skeleton workspace. The screenshot and explicit current Russian instructions take precedence over the older English-interface assumption in PRODUCT.md. The user subsequently approved extending this identity to all newsroom routes.

**Key Characteristics:**
- Keep the header and sidebar shared across all routes.
- Reproduce the supplied header, sidebar, and action buttons on `/`.
- Use quiet tonal placeholders throughout the banking workspace.

## Colors

News tokens retain their existing roles: white canvas, dark text, gray secondary text and dividers, blue source-link accent. Status colors remain reserved for run states.

Alfa tokens apply to all routes and the demo dialog: cool gray canvas, dark compact labels, white actions, pale nested panels, and slightly darker skeleton blocks. Red identifies keyboard focus and the supplied Alfa identity; blue identifies the new navigation badge. Small company marks retain the source's distinct colors without creating a new product-wide accent palette.

**The Shared Layout Rule.** News routes use the same Alfa header, sidebar, logo, typography and icon library. The banking action row and skeleton workspace appear only at `/`.

## Typography

News uses Arial/Helvetica with 30px page headings, 17px story headings, 13px excerpts, and 11px metadata. Article text is 15px with 1.85 line height.

Alfa uses the Arial/Helvetica stack evidenced in BankMock.css across the shared application. Navigation is compact; action labels are larger. The brand is 14px at weight 600, company labels 12px, secondary company text 10px, and the demo caption 11px. Do not promote this screenshot-specific stack into a new display-font recommendation for other surfaces.

## Layout

News inherits the sidebar gutters. Content uses white 15px-radius cards on the gray canvas, with publication/run-history tabs above it. Four summary tiles become two columns below 1000px. Filters become a two-column grid on mobile, with source spanning both columns.

At the 1280×720 reference size, Alfa has a sticky 48px header pinned at top: 0 on every route, fixed 200px sidebar beginning below the header, and main content beginning at x=240px with 42px right padding. The action row starts at y=58px, is 38px high, and leaves 26px before the summary. The summary starts at y=122px, is 372px tall, and uses columns `2.05fr 1fr .98fr`. Lower panels use `2.08fr 1fr 1fr`; settings stay at the sidebar bottom and chat at the viewport bottom-right. Skeleton tabs begin at y=525px and lower panels at y=577px, as derived from current CSS rather than the earlier planned coordinates.

At 1100px and below, main content starts at 220px, right padding becomes 24px, summary and lower panels become two columns, and card/promo placeholders disappear. At 760px and below, the header is 58px and sticky, the 215px sidebar opens through a menu button and backdrop, main margins reset, actions form a two-column grid, and the workspace becomes one column. At 1500px and above the main element has a 1600px maximum width.

## Elevation & Depth

News uses flat white cards with no shadows. Alfa uses tonal nesting and rounded panels, without shadows on ordinary buttons. The floating chat alone has `0 4px 12px #0002`. The demo dialog uses a dim overlay (`#10111666`); the mobile menu backdrop uses `#0004`. These are local overlay treatments.

## Shapes

Alfa uses rounded rectangular actions, nested summary panels, smaller skeleton bars, and circular avatars/chat indicators. The summary radius becomes 17px on mobile. Lower cards use their own radius; the dialog uses 18px. News selectors use 10px radii and 42px height; labels use 5px radii. The collection action uses Alfa red.

## Components

### Alfa header and navigation

Use the supplied `front/src/assets/alfa-logo.png`, rendered at 32×32px on desktop and 30×30px on mobile. This is a user-supplied identity asset, not a generated image. Hugeicons provide outline icons with stroke width 1.6; shadcn-style Button, Skeleton, and Dialog wrappers supply component structure.

The first sidebar link is **Ньюсрум**, routes to `/news`, and alone carries the **НОВОЕ** badge. **Заявки** has no badge. Navigation rows are 38.4px high, with 17px icons and an 11px gap. The sidebar scrolls when needed. Header controls and other banking buttons open explanatory demo dialogs.

### Alfa actions and feedback

The action row reads **Скачать выписку**, **Импорт платежей**, **Создать платёж**, **Ещё**. Actions are visual demo controls; they do not execute banking requests. The dialog says: “Это демонстрационный макет. Банковские операции недоступны.” The “Все сервисы” dialog also links to `/news`.

Shell buttons have no transitions. Sidebar links use the explicit hover fill. Shell links and buttons have a red 2px focus outline with 4px offset; retain the skip link, accessible icon labels, and mobile menu expanded state. Overlay focus behavior belongs to the existing dialog implementation.

### Static workspace

Summary, tabs, applications, conversions, and promotional areas are placeholders, not live financial content or pending network results. Skeletons explicitly disable animation; decorative groups are hidden from assistive technology. Keep the accessible demo heading and visible “Демонстрационный макет” caption.

**The Static Workspace Rule.** Do not add pulse, shimmer, fabricated balances, charts, or operational financial data to this mock.

### Existing news components

Preserve filtering, pagination, article links, collection, token costs and run progress. Use Hugeicons for Telegram/RSS/web sources, navigation, collection and external links. The active newsroom sidebar row has a gray fill; subnavigation uses a red underline. No animation or decorative imagery is added.

## Do's and Don'ts

- Do share Alfa chrome across root and newsroom routes.
- Do preserve the supplied Alfa PNG and the screenshot's shell hierarchy.
- Do keep Ньюсрум linked to `/news` with НОВОЕ, and Заявки without the badge.
- Do preserve news and run-history functionality inside the shared design.
- Don't turn static placeholders into simulated live banking content.
- Don't treat static-mock review approval as approval for real banking operations.

### Business selector

The header company control opens an anchored Radix popover on desktop and a
viewport-constrained popover on mobile. Use Hugeicons and the shared neutral
palette, 16px panel radius, 410px maximum width and a soft downward shadow.
Search is debounced by 250ms, results are server-paged at 20 companies, and only
the selected ID is saved locally. Synthetic IDs identify companies without
invented names. Show city, industry and revenue to help distinguish profiles.

Motion for React animates the panel as one unit: 160ms ease-out, opacity plus
5px vertical travel and scale from .985. Reduced motion uses 100ms opacity only.
Escape/outside interaction closes it; focus starts in search and returns to the
trigger on dismissal. Keep loading, empty, retry, clear-selection and pagination states.

### Company onboarding workspace

For a selected company with incomplete onboarding, replace the main route's
content with a source-selection workspace. Keep the shared Alfa header and
sidebar; never use a popup or a dismiss/skip action for first-time onboarding.
Use a 30px heading, the company ID, a native checkbox grid (3/2/1 columns),
Telegram/publisher source marks, and the shared red primary action. A successful save
reveals the requested route. Completed companies can edit preferences inline
through the company selector and cancel an edit. Loading/errors stay inside
the workspace; only successful persistence marks onboarding complete.

### Recommendation workspace

`/news` shows company-scoped recommendations in the shared Alfa shell. Saved
onboarding sources are automatic; the source-count control opens existing source
settings. Topic/risk filters are collapsed under «Фильтры». Three compact white
cards align left in a 760px column: 12px corners, 22px/24px padding (18px mobile),
17px titles, one short action, service link and labelled source marks. Rationale
and individual news links are under «Почему это важно». Keep only one red action.
Below, supporting news form a horizontal strip of 270px cards (240px mobile),
native scroll and arrow controls, no autoplay. Arrow scrolling is smooth normally
and immediate for reduced motion. Before generation, show at most 10 eligible
news previews. Global usage and context are collapsed in the footer. The raw feed
and run history remain directly accessible for debugging with no navigation links.
Keep no-company, loading, unavailable-model, insufficient-evidence and retry states.
Source marks are local Telegram SVG/publisher favicons with contained 14–20px sizing.
