# Обзор — news demo

React + TypeScript + React Router. Routes: `/` (Alfa-Business shell mock with static workspace skeletons),
`/news` (inbox/source filter/pagination),
`/news/:id` (article), `/runs` (live run history).

```sh
npm ci
npm run dev
npm run build
npm run lint
```

Start FastAPI separately with `.venv/bin/python -m backend.serve` from the repo root.
API defaults to http://localhost:8000. Set `VITE_API_URL` at build time for deployment.

Production: https://newsroom-web-production-32f5.up.railway.app
API: https://alpha-hack-2026-production.up.railway.app/docs

Railway service newsroom-web builds from GitHub main with root directory `/front`.
The multi-stage Dockerfile uses nginx on port 8080 with SPA fallback, so direct
links and refreshes work on `/runs` and `/news/:id`.

The public demo trigger classifies at most 5 articles when credentials exist and is globally limited to one run per five minutes.
AI credentials stay on the API service and are never bundled into frontend assets.

The mock uses Hugeicons and local shadcn-style Button, Skeleton, and Radix Dialog components.
The Alfa logo in `src/assets/alfa-logo.png` was supplied by the user. Banking controls
open demo notices; “Все сервисы” links to the live news inbox. No banking operations are implemented.

News, article details, and run history share the Alfa shell. `Newsroom.css` styles live content; banking actions and skeletons are limited to `/`.

The company selector uses `/api/businesses` (20 results per page, debounced search)
and saves only the selected ID locally. Future recommendation callers must use
`recommendationRequest` from `src/lib/api.ts`; ordinary news requests remain unfiltered.
The dropdown uses Motion for React with opacity-only reduced motion.
