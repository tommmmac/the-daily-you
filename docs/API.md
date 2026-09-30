# API

> **Status:** the Phase 0 and 1 routes and the Phase 2 entry routes are built. Anything marked *planned* may change. Request and response shapes live as zod schemas in `packages/shared`, which is the source of truth.

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
| `POST` | `/api/print` | 1 | `{ sessionId }` → `{ date, headline, version, page }`. Prints the chat onto its day's entry: page 1 if nothing's printed yet, its own page again if it's already a page, otherwise a new page at the end. `headline` is that page's. |

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
| `DELETE` | `/api/entries/:date` | 2 | Delete the day. → `ChangeResult` |
| `POST` | `/api/entries/:date/pages/:page/edit` | 2 | `{ instruction }`: the Copy Desk rewrites that page (from 1). → `ChangeResult` |
| `DELETE` | `/api/entries/:date/pages/:page` | 2 | Delete one page. Deleting the only page deletes the entry. → `ChangeResult` |
| `GET` | `/api/entries/:date/versions` | 2 | `[{ version, updated }]`, newest first. |
| `POST` | `/api/entries/:date/versions/:v/restore` | 2 | Restore an old version as a new version (works after a delete too). → the entry |
| `PUT` | `/api/entries/:date` | planned | Save a manual edit (full Markdown). Creates a new version. |
| `GET` | `/api/entries/:date/versions/:v` | planned | A specific old version. |

`ChangeResult` is `{ date, page, headline?, deleted, undo }`. `undo` is the version to restore to undo the change, and `deleted` is true when the whole entry is gone. Every change saves the old file to `data/versions/<date>/` first.

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
