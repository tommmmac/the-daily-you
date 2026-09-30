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

## Repo layout

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
│           ├── agents/      # one folder per agent (config only) + _engine/
│           ├── tools/       # tools agents can use, by name
│           ├── schemas/     # structured outputs agents can return
│           ├── newsroom/    # workflows that use agents (print)
│           ├── llm/         # ollama client (claude/openai later)
│           ├── store/       # entries (fs), db (sqlite), vectors
│           └── calendar/    # ICS fetch + parse
├── packages/
│   └── shared/              # zod schemas + TS types shared by web & server
├── data/                    # your diary (gitignored)
└── docs/
```

`packages/shared` is the contract between frontend and backend. If a request or response shape changes, it changes there first.

## The agents

Agents are **pure config**: a folder with a prompt and settings, and no code. Agent code is pulled out into shared folders:

```
apps/server/src/
├── agents/
│   ├── _engine/          # the framework: types, loader, registry, router, runner
│   ├── reporter/
│   │   ├── manifest.yaml # name, description (what the router reads), routable, model, tools, output
│   │   ├── agent.md      # system prompt with {{date}}, {{weekday}}, {{time}}, {{name}}
│   │   └── README.md     # 2–3 sentences for humans
│   └── copydesk/         # same three files; manifest has `output: story`
├── tools/                # tools any agent can list in `tools: [...]` (recall in Phase 3)
├── schemas/              # structured outputs agents can return (`story`)
└── newsroom/             # workflows that use agents, e.g. print.ts
```

- **Personas, capabilities, workflows.** Agents are *who* (a prompt and settings). `tools/` and `schemas/` are *what they can do*, shared by name. `newsroom/` is *when things happen*: code that calls agents, like printing.
- **Auto-discovered and checked.** At startup the loader scans for folders with a `manifest.yaml`. It stops with a clear error if a manifest names a tool, output or model that doesn't exist. Adding an agent means adding a folder.
- **One entry point for chat.** Every chat turn goes through `chat()` in `_engine/run.ts`: route → run the agent with the session history (resolving any tool calls, then adding a grounding reminder) → save both turns, tagged with the agent that answered.
- **Structured output.** Agents with `output:` are called with `runStructured()`. The model is forced to reply with JSON in that schema, the reply is checked with zod, and it retries once if the check fails.
- **Shared session memory.** All agents in a session read and write the same transcript, so switching desks mid-conversation keeps context.

The full contract is in [apps/server/src/agents/README.md](../apps/server/src/agents/README.md).

### Editor-in-Chief (router)

The router is `_engine/router.ts`, not a folder, because it chooses between agents rather than being one.

- **Buttons skip the model.** "Go to print" and similar actions call their agent directly in code.
- **Free text:** the router's prompt is built from every *routable* agent's `description`. The model replies with just an agent name.
- **Only one routable agent:** no model call at all. This is the case in Phase 1, where only the Reporter chats.
- **Unusable answer:** if the call fails or the answer isn't an agent name, it falls back to manifest `keywords` (only if exactly one agent matches), then to the **Reporter**. Being wrong in that direction costs little, since the Reporter just keeps chatting.

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

The app isn't tied to a model or provider. Agents never name a model: a manifest says `model: reporter`, meaning "whatever the reporter role is set to". All LLM calls go through `apps/server/src/llm/`, which today has one provider:

- `chat()`: one complete reply, optionally with tools or constrained to a JSON schema
- `chatStream()`: the reply token by token
- `listModels()`: what's installed, for the health check

Today that's Ollama. Cloud providers (Claude, OpenAI) are planned as extra providers behind the same functions, so agents, prompts and workflows don't change.

Models are chosen per role in `.env`:

| Role | Needs | Setting | Default |
| --- | --- | --- | --- |
| `router` | fast, good at following a strict format | `MODEL_ROUTER` | `qwen2.5:14b` |
| `reporter` | fast, conversational | `MODEL_REPORTER` | `qwen2.5:14b` |
| `copydesk` | good writing, reliable JSON | `MODEL_COPYDESK` | `qwen2.5:14b` |
| `embed` | embeddings (Phase 3) | `MODEL_EMBED` | `nomic-embed-text` |

The defaults use one local model for every role, because Ollama keeps a single model loaded and nothing gets swapped in and out. Point any role at a different model, smaller for speed or larger for quality, without touching code.

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
web: POST /api/sessions                    ──► new transcript for today's diary date
web: POST /api/chat {sessionId}            ──► Reporter opens the interview (SSE)
web: POST /api/chat {sessionId, message}   ──► router ──► Reporter ──► SSE stream of tokens
web: POST /api/print {sessionId}           ──► newsroom/print.ts → copydesk, using every chat from that day
                                                ├─ transcripts → JSON (schema-constrained, zod-validated, retry once)
                                                ├─ JSON → Markdown (template)
                                                ├─ old version → data/versions/<date>/vN.md
                                                └─ write data/entries/YYYY/MM/<date>.md
                                            ◄── { date, headline, version }
web: navigate to /journal/<date>
```

Phase 1 reprints rewrite the whole entry from all of the day's chats. Merging into the existing story is Phase 2.

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
