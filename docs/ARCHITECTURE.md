# Architecture

How The Daily You fits together. This describes the **planned** design and will change as the phases land. Keep it up to date when something changes.

## Big picture

```
 ┌──────────────────────────┐        HTTPS (Tailscale)
 │  Phone / Desktop browser │◄──────────────────────────┐
 │  React PWA (apps/web)    │                           │
 └────────────┬─────────────┘                           │
              │ fetch + SSE (/api/*)                    │
 ┌────────────▼─────────────────────────────────────────┴───┐
 │  Bun + Hono server (apps/server)                          │
 │                                                            │
 │   ┌──────────────────┐                                    │
 │   │ Editor-in-Chief  │  routes each message by intent     │
 │   └──┬──────┬─────┬──┘                                    │
 │      │      │     │                                        │
 │  ┌───▼───┐ ┌▼─────────┐ ┌▼──────────┐                      │
 │  │Reporter│ │The Morgue│ │ Copy Desk │                      │
 │  └───┬───┘ └────┬─────┘ └─────┬─────┘                      │
 │      │          │             │                             │
 │  ┌───▼──────────▼─────────────▼───┐   ┌────────────────┐   │
 │  │ LLM provider layer             │──►│ Ollama (local) │   │
 │  │ (Ollama | Claude | OpenAI)     │   │ or cloud API   │   │
 │  └────────────────────────────────┘   └────────────────┘   │
 │                                                            │
 │  Storage: data/ (Markdown + SQLite + sqlite-vec)           │
 │  Calendar: ICS fetcher                                     │
 └────────────────────────────────────────────────────────────┘
```

A single Bun process serves the API and, in production, the built frontend as static files. It runs on your own machine, and your phone reaches it through Tailscale.

## Repo layout (proposed)

A Bun workspaces monorepo, so the frontend and backend live side by side and share types:

```
the-daily-you/
├── apps/
│   ├── web/                 # Frontend: React + Vite + Tailwind + shadcn
│   │   └── src/
│   │       ├── routes/      # chat, journal, entry, search, settings
│   │       ├── components/
│   │       └── lib/api.ts   # typed client for the server
│   └── server/              # Backend: Bun + Hono
│       └── src/
│           ├── index.ts     # Hono app, mounts routes
│           ├── routes/      # chat, entries, search, memory, settings
│           ├── agents/      # editor.ts, reporter.ts, morgue.ts, copydesk.ts
│           ├── prompts/     # prompt templates (plain .md files)
│           ├── llm/         # provider interface + ollama/claude/openai
│           ├── store/       # entries (fs), db (sqlite), vectors
│           └── calendar/    # ICS fetch + parse
├── packages/
│   └── shared/              # zod schemas + TS types shared by web & server
├── data/                    # your diary (gitignored)
└── docs/
```

`packages/shared` is the contract between frontend and backend. If a request or response shape changes, it changes there first.

## The agents

Agents are ordinary TypeScript modules: a prompt, some tools, and a call to the LLM layer. There's no agent framework. Each one takes a context object and returns a result or a stream.

### Editor-in-Chief (router)

- **Buttons skip the model.** "Go to print", "Edit entry" and similar actions are sent as an explicit `action` and routed in code.
- **Free text** goes to a small, fast model with a strict JSON schema:
  ```json
  { "intent": "chat" | "edit_entry" | "recall" | "print", "confidence": 0.0 }
  ```
- If the output fails to parse, or the confidence is low, the message goes to the **Reporter**. Being wrong in that direction costs little, since the Reporter just keeps chatting.
- In Phase 1 there's no router: everything goes to the Reporter, and printing happens only through the button.

### Reporter

- Conversational interviewer. Streams replies.
- Context it gets:
  - today's date and time, plus today's calendar events (Phase 4)
  - the facts file (`memory.md`), trimmed to what's relevant (Phase 3)
  - the last few entries' headlines and summaries
  - a `recall` tool that queries The Morgue (Phase 3)
- Aim: ask one good follow-up at a time, pick up on threads from past days ("Did the bike hold up?"), and know when there's enough for a story.

### The Morgue (memory)

Two kinds of memory:

1. **Entries index:** each entry is split into chunks, embedded with an Ollama embedding model, and stored in `sqlite-vec`. Search combines vector similarity with SQLite FTS5 keyword search.
2. **Facts file:** `data/memory.md`, a human-readable, human-editable list of people, projects and goals. After each print, an extraction step suggests additions or updates, which are merged into the file. Because it's plain Markdown, the user always has the final say.

### Copy Desk

Two-step generation, so the output stays reliable with small local models:

1. **Transcript → structured JSON** (validated with zod):
   ```json
   {
     "headline": "...",
     "subhead": "...",
     "dateline": "MELBOURNE",
     "lede": "...",
     "sections": [{ "heading": "...", "body": "..." }],
     "pull_quote": "...",
     "mood": 7,
     "tags": ["..."],
     "people": ["..."]
   }
   ```
2. **JSON → Markdown** with a plain template function (no LLM). This keeps formatting consistent and makes restyling easy.

**Edits** ("change that bit"): the Copy Desk gets the current entry and the instruction and returns updated JSON. The previous version is saved first (see Versioning).

**Appending** (second chat on the same day): the Copy Desk gets the existing entry and the new transcript and merges them into one story. It doesn't just tack on a second article.

## LLM provider layer

A single interface so agents don't care what's behind it:

```ts
interface LLM {
  chat(opts: { model: string; messages: Msg[]; stream?: boolean; json?: ZodSchema }): ...
  embed(opts: { model: string; input: string[] }): Promise<number[][]>
}
```

Implementations: `OllamaLLM` (default), and later `AnthropicLLM` and `OpenAILLM`. Model names are chosen per role in settings:

| Role | Needs | Example default (TBD) |
| --- | --- | --- |
| `router` | fast, good at JSON | small ~3B model |
| `reporter` | fast, conversational | ~8B model |
| `copydesk` | quality writing, JSON | the best model the machine can run |
| `embed` | embeddings | `nomic-embed-text` |

## Storage

Plain files are the source of truth. SQLite is an **index** that can always be rebuilt from `data/`.

```
data/
├── entries/
│   └── 2026/
│       └── 09/
│           └── 2026-09-29.md       # the entry (frontmatter + Markdown)
├── versions/
│   └── 2026-09-29/
│       ├── v1.md
│       └── v2.md
├── transcripts/
│   └── 2026-09-29/
│       └── <session-id>.json       # raw chat, kept for re-printing/appending
├── media/                          # photos (Phase 6)
├── memory.md                       # facts file
├── settings.json                   # models, calendars, masthead name, etc.
└── daily-you.db                    # SQLite: metadata, FTS, sqlite-vec
```

- **Entry format:** see [ENTRY_FORMAT.md](ENTRY_FORMAT.md).
- **SQLite tables (rough):** `entries` (date, issue, headline, mood, tags, updated_at, hash), `chunks` + `chunks_vec` (embeddings), `chunks_fts`, `sessions`, `events`.
- **Reindex:** on startup, compare file hashes with `entries.hash` and reindex anything that changed. This means hand-editing an entry in a text editor just works.
- **Versioning:** before any overwrite, copy the current file to `versions/<date>/vN.md`. Plain files are simple and inspectable. If `data/` is a git repo, that works too.

## Main flows

### Chat → print (Phase 1)

```
web: POST /api/chat {sessionId, message}   ──► Reporter ──► SSE stream of tokens
web: POST /api/print {sessionId}           ──► Copy Desk
                                                ├─ transcript → JSON (validated, retry once)
                                                ├─ JSON → Markdown
                                                ├─ write data/entries/.../<date>.md
                                                └─ update SQLite (+ embeddings, facts in Phase 3)
                                            ◄── { date, headline }
web: navigate to /entry/<date>
```

### Recall (Phase 3)

"When did I last go climbing?" → router says `recall` → Morgue hybrid search → top chunks + dates → the Reporter answers with citations to entries.

## Calendar (Phase 4)

- User pastes one or more ICS URLs (Google/Outlook/iCloud "secret address") in settings.
- Server fetches and caches them (for example every 30 min), and expands recurring events with a library such as `node-ical` or `ical.js`.
- Today's events go into the Reporter's context. On print, they're written to the entry's `events` frontmatter.

## Security & access (Phase 5)

- By default, bind to `127.0.0.1`. For phone access, use Tailscale (`tailscale serve` gives HTTPS on the tailnet), which the PWA and push notifications need.
- Simple single-user auth: a passphrase set on first run, stored as a hash, with a long-lived session cookie. This is a backstop, since Tailscale already limits who can reach the server.
- API keys for cloud models live in `data/settings.json` or `.env` and are never sent to the frontend.

## Principles

- **Local-first:** works fully offline with Ollama, and your data is plain files you own.
- **Files are truth:** SQLite can be deleted and rebuilt.
- **Code before model:** use deterministic code wherever it works (button routing, Markdown templating), and save LLM calls for what needs them.
- **Small-model friendly:** use structured JSON outputs with validation and retries, plus short focused prompts.
