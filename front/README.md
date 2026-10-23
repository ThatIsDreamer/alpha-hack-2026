# Обзор — news demo

React + TypeScript + React Router. Routes: `/` (inbox/source filter/pagination),
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

The public demo trigger is scrape-only, globally limited to one run per five minutes.
AI credentials stay on the API service and are never bundled into frontend assets.
