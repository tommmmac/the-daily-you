# Roadmap

Seven phases. Tasks are tagged **Frontend**, **Backend** or **Shared** (both sides depend on it). Phase 1 is the MVP, and everything after builds on it.

Tick items off here as they land. For bigger items, open a GitHub issue and link it.

---

## Phase 0: Setup

- [ ] **Frontend:** React + Vite + Tailwind + shadcn scaffold, basic layout
- [ ] **Backend:** Bun + Hono server, Ollama connected, data folder structure
- [ ] **Shared:** decide the entry format (frontmatter fields) → [docs/ENTRY_FORMAT.md](docs/ENTRY_FORMAT.md)
- [ ] **Shared:** decide the API routes → [docs/API.md](docs/API.md)
- [ ] **Shared:** monorepo layout, shared types package, lint/format config

**Done when:** `bun run dev` starts both web and server, and the web app can hit `GET /api/health` and see that Ollama is up.

## Phase 1: First Edition (MVP)

- [ ] **Frontend:** chat UI (streaming messages, "Go to print" button)
- [ ] **Frontend:** journal view (list of days, render Markdown)
- [ ] **Backend:** Copy Desk agent (transcript → JSON → Markdown with headline)
- [ ] **Backend:** basic Reporter prompt
- [ ] **Backend:** save entry to `data/entries/YYYY/MM/YYYY-MM-DD.md`

**Goal:** chat about your day, go to print, read it back.

## Phase 2: Print Quality

- [ ] **Frontend:** newspaper styling, custom masthead ("The Tom Times"), Vol/No issue numbers
- [ ] **Backend:** Editor-in-Chief router (intent JSON: `chat`, `edit_entry`, `recall`, `print`)
- [ ] **Backend:** edit entries via the Copy Desk ("change that bit")
- [ ] **Backend:** version history
- [ ] **Backend:** append multiple chats to the same day

## Phase 3: The Morgue (memory)

- [ ] **Frontend:** search page
- [ ] **Frontend:** facts viewer/editor (`memory.md`)
- [ ] **Backend:** embeddings + `sqlite-vec`
- [ ] **Backend:** facts extraction after each entry
- [ ] **Backend:** recall tool for the Reporter

## Phase 4: On the Beat (calendar)

- [ ] **Frontend:** settings page to paste an ICS link and choose calendars
- [ ] **Backend:** ICS parsing
- [ ] **Backend:** feed today's events into the Reporter prompt
- [ ] **Backend:** add events to entry frontmatter

## Phase 5: Home Delivery (mobile)

- [ ] **Frontend:** PWA setup (`vite-plugin-pwa`), mobile layout
- [ ] **Backend:** login/auth
- [ ] **Backend:** Tailscale setup guide
- [ ] **Backend:** nightly push reminder

## Phase 6: Special Features

Pick and choose. No particular order.

- [ ] Voice journaling (local Whisper)
- [ ] Weekend Edition: weekly review from a Reflector agent
- [ ] Mood trends charts + streaks
- [ ] Photos in entries
- [ ] Print edition: export a month or year as a PDF newspaper
- [ ] Cloud model option (Claude/OpenAI API key)
- [ ] Themes: broadsheet, tabloid, dark mode

## Phase 7: Go to Press (release)

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

- [ ] Is `qwen2.5:14b` fast enough for chat, or should the Reporter/router move to a smaller model? (Starting with 14b everywhere, `nomic-embed-text` for embeddings.)
- [ ] Memory agent name: **The Morgue** or **Archives**?
- [ ] Is "day" a calendar day, or does a 1am chat count as the previous day? (Suggest: configurable cutoff, default 4am.)
- [ ] Issue numbering: count of entries, or days since the first entry?
