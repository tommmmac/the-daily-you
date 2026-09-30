# API

> **Status:** the Phase 0 and 1 routes are built. Everything from Phase 2 on is planned and may change. Request and response shapes live as zod schemas in `packages/shared`, which is the source of truth.

All routes are under `/api`. JSON in and out, unless noted. Streaming uses Server-Sent Events.

## Health

| Method | Route | Phase | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | 0 | `{ ok, ollama: { up, host, models[] }, version }` |

## Chat

| Method | Route | Phase | Description |
| --- | --- | --- | --- |
| `POST` | `/api/sessions` | 1 | Start a chat session. `{ date? }` → the `Session` (`id`, `date`, `created`, `messages`). The date defaults to today's diary date. |
| `GET` | `/api/sessions/:id` | 1 | Session transcript. |
| `POST` | `/api/chat` | 1 | `{ sessionId, message? }` → **SSE** stream (see below). Leave out `message` to have the Reporter open the interview. |
| `POST` | `/api/print` | 1 | `{ sessionId }` → `{ date, headline, version }`. Writes the day's entry from every chat that day. |

SSE events from `/api/chat`:

```
event: route   data: {"agent":"reporter"}
event: token   data: {"text":"How"}
event: done    data: {"agent":"reporter"}
event: error   data: {"message":"Can't reach Ollama. Is it running?"}
```

Print can take a while on a local model: about 10s once the model is loaded, and up to a minute or more on the first call while it loads.

## Entries

| Method | Route | Phase | Description |
| --- | --- | --- | --- |
| `GET` | `/api/entries?from=&to=` | 1 | List: `[{ date, issue, headline, mood, tags }]`, newest first. |
| `GET` | `/api/entries/:date` | 1 | `{ frontmatter, markdown }` |
| `PUT` | `/api/entries/:date` | 2 | Save a manual edit (full Markdown). Creates a new version. |
| `POST` | `/api/entries/:date/edit` | 2 | `{ instruction }`: the Copy Desk edits the entry. Returns the new version. |
| `GET` | `/api/entries/:date/versions` | 2 | `[{ version, updated }]` |
| `GET` | `/api/entries/:date/versions/:v` | 2 | A specific old version. |
| `POST` | `/api/entries/:date/versions/:v/restore` | 2 | Restore an old version (as a new version). |

## The Morgue

| Method | Route | Phase | Description |
| --- | --- | --- | --- |
| `GET` | `/api/search?q=&limit=` | 3 | Hybrid search → `[{ date, headline, snippet, score }]` |
| `GET` | `/api/memory` | 3 | `memory.md` contents. |
| `PUT` | `/api/memory` | 3 | Replace `memory.md`. |
| `POST` | `/api/reindex` | 3 | Rebuild SQLite + embeddings from `data/`. |

## Settings & calendar

| Method | Route | Phase | Description |
| --- | --- | --- | --- |
| `GET` | `/api/settings` | 2 | Masthead name, models per role, day cutoff, etc. Secrets are redacted. |
| `PATCH` | `/api/settings` | 2 | Partial update. |
| `GET` | `/api/calendar/today` | 4 | Today's events from all enabled calendars. |
| `POST` | `/api/calendar/test` | 4 | `{ url }` → the calendars found in the ICS, for the picker. |

## Auth (Phase 5)

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/auth/setup` | First run: set a passphrase. |
| `POST` | `/api/auth/login` | `{ passphrase }` → sets a session cookie. |
| `POST` | `/api/auth/logout` | |

## Errors

Non-2xx responses return `{ error: { code, message } }`. Codes include `not_found`, `invalid_request`, `llm_unavailable`, `llm_bad_output`, and `unauthorized`.
