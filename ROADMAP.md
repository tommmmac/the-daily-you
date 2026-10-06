# Roadmap

Eight phases. Tasks are tagged **Frontend**, **Backend** or **Shared** (both sides depend on it). Phase 1 is the MVP, and everything after builds on it.

Tick items off here as they land. For bigger items, open a GitHub issue and link it.

---

## Phase 0: Setup

- [x] **Frontend:** React + Vite + Tailwind + shadcn scaffold, basic layout
- [x] **Backend:** Bun + Hono server, Ollama connected, data folder structure
- [x] **Shared:** decide the entry format (frontmatter fields) → [docs/ENTRY_FORMAT.md](docs/ENTRY_FORMAT.md)
- [x] **Shared:** decide the API routes → [docs/API.md](docs/API.md)
- [x] **Shared:** monorepo layout, shared types package, CI (typecheck + build)
- [ ] **Shared:** lint/format config (Biome?), not urgent

**Done when:** `bun run dev` starts both web and server, and the web app can hit `GET /api/health` and see that Ollama is up.

## Phase 1: First Edition (MVP)

- [x] **Frontend:** chat UI (streaming messages, "Go to print" button)
- [x] **Frontend:** journal view (list of days, render Markdown)
- [x] **Backend:** agent engine (folder-per-agent, auto-discovered, router with keyword fallback)
- [x] **Backend:** Copy Desk agent (transcript → JSON → Markdown with headline)
- [x] **Backend:** basic Reporter prompt
- [x] **Backend:** save entry to `data/entries/YYYY/MM/YYYY-MM-DD.md`
- [x] **Backend:** API: sessions, streaming chat, print, entries (+ tests)

**Goal:** chat about your day, go to print, read it back.

## Phase 2: Print Quality

- [x] **Frontend:** newspaper styling, custom masthead ("The Tom Times"), Vol/No issue numbers
- [x] **Shared:** settings page: name, paper name, dateline, day cutoff, models (saved to `data/settings.json`)
- [x] **Backend:** Editor-in-Chief router (intent JSON: `chat`, `edit_entry`, `recall`, `print`). It suggests a button and never acts on its own
- [x] **Backend:** edit entries via the Copy Desk ("change that bit"), from each page's Edit button
- [x] **Backend:** version history (saved on every change, restore/undo; no browsing UI yet)
- [x] **Backend:** append multiple chats to the same day (each printed chat is a new page)
- [x] **Frontend:** edit and delete buttons per page, delete per entry, undo
- [x] **Shared:** `bun run wipe` to clear `data/` while testing

## Phase 3: The Morgue (memory)

Memory is there so the Reporter can ask better questions, not so you can search your diary.

- [x] **Frontend:** facts editor (`memory.md`), with undo
- [x] **Backend:** the Reporter reads the facts file every chat ("went to work" gets "the bar or the cafe?")
- [x] **Backend:** facts extraction after each print by the Archivist (auto-saved, undoable)
- [x] **Backend:** open threads: things to follow up on ("how'd the exam go?"), picked up after each print and brought up when they're due
- [x] **Frontend:** Memory page lists open threads (dismissable) and what was learned after each print
- [x] **Backend:** embeddings in a SQLite index (plain `bun:sqlite`, rebuilt from `data/`)
- [x] **Backend:** callbacks: recall a related past entry while you chat, picked by the model from the closest matches
- [x] **Backend:** recall eval (`bun run eval:recall`)
- [x] **Backend:** patterns ("haven't heard about John in a while") from entry tags and people
- [x] **Backend:** label other agents' turns in each agent's history, so one agent doesn't treat another's replies as its own (see [FINDINGS](docs/FINDINGS.md), 2026-10-01)

## Phase 4: On the Beat (calendar)

- [x] **Frontend:** settings page to paste an ICS link and choose calendars
- [x] **Backend:** ICS parsing
- [x] **Backend:** feed today's events into the Reporter prompt
- [x] **Backend:** add events to entry frontmatter

## Phase 5: Home Delivery (mobile)

- [x] **Frontend:** PWA setup (`vite-plugin-pwa`), mobile layout
- [x] **Backend:** the server serves the built app, so it's one address, and `bun run autostart` starts it on Windows login
- [x] **Backend:** login/auth
- [x] **Backend:** Tailscale setup guide → [docs/PHONE.md](docs/PHONE.md)
- [x] **Backend:** nightly push reminder

## Phase 6: New Look (UI rework)

Open-ended: keep going through the app and fixing what bugs me until I'm happy with how it looks and feels.

- [x] **Frontend:** themes: broadsheet, tabloid, night edition (or automatic), gazette, gossip, newsroom terminal, picked in Settings per device
- [ ] **Frontend:** a pass over every page (Chat, Journal, an entry, Memory, Settings, sign-in) on the PC and on a phone, noting what feels off
- [ ] **Frontend:** fix that list, one page at a time

**Done when:** I stop finding things I want to change.

## Phase 7: Special Features

Pick and choose. No particular order.

- [ ] Search page over past entries (uses the Phase 3 index)
- [ ] Voice journaling (local Whisper)
- [ ] Weekend Edition: weekly review from a Reflector agent
- [ ] Mood trends charts + streaks
- [ ] Photos in entries
- [ ] Print edition: export a month or year as a PDF newspaper
- [ ] Cloud model option (Claude/OpenAI API key)

## Phase 8: Go to Press (release)

- [ ] README + install script (or Dockerfile)
- [ ] A few tests
- [ ] Demo GIF
- [ ] Post to r/selfhosted and r/LocalLLaMA

---

## Decisions

| Date | Decision |
| --- | --- |
| 2026-09-29 | **Self-hosted web app + PWA** (Odysseus-style), not Tauri. A Tauri `.exe` wrapper can be added later using the same React code. |

## Open questions

- [ ] Which model sizes are good enough for each role (chat vs printing), and does a smaller model for the Reporter/router make chat noticeably faster?
- [ ] Memory agent name: **The Morgue** or **Archives**?
- [ ] Is "day" a calendar day, or does a 1am chat count as the previous day? (Suggest: configurable cutoff, default 4am.)
- [ ] Issue numbering: count of entries, or days since the first entry?
