# Architecture

How The Daily You fits together. It covers what's built and what's planned, and planned parts are marked with the phase they belong to (see the [Roadmap](../ROADMAP.md)). Keep it up to date when something changes.

## What's built so far

Phase 1: the Reporter and Copy Desk agents, the agent engine and router, chat with streaming, printing to Markdown, and a web app with chat, journal and entry pages.

From Phase 2: pages (each printed chat adds a page to the day), editing a page through the Copy Desk (the Edit button on each page), deleting pages and entries, and undo through saved versions. From Phase 3: a facts file the Reporter reads every chat, the Archivist, which updates it and keeps a list of things to follow up on after each print, and recall of related past days while you chat. Everything runs on Ollama. Plain files are the source of truth, with a SQLite index for recall that can always be rebuilt. There's no calendar, cloud models, PWA or auth yet.

## Big picture

```
 ┌──────────────────────────┐
 │  Desktop browser         │   phone via Tailscale + PWA: Phase 5
 │  React app (apps/web)    │
 └────────────┬─────────────┘
              │ fetch + SSE (/api/*)
 ┌────────────▼─────────────────────────────────────────────┐
 │  Bun + Hono server (apps/server), localhost only          │
 │                                                           │
 │   ┌──────────────────┐                                    │
 │   │ Editor-in-Chief  │  picks an agent for chat messages  │
 │   └──┬──────┬─────┬──┘                                    │
 │      │      │     │                                       │
 │  ┌───▼────┐ ┌▼──────────┐ ┌▼──────────┐                   │
 │  │Reporter│ │The Morgue │ │ Copy Desk │                   │
 │  └───┬────┘ │ (Phase 3) │ └─────┬─────┘                   │
 │      │      └───────────┘       │                         │
 │  ┌───▼──────────────────────────▼─┐   ┌────────────────┐  │
 │  │ LLM layer (llm/ollama.ts)      │──►│ Ollama (local) │  │
 │  └────────────────────────────────┘   └────────────────┘  │
 │                                                           │
 │  Storage: data/ (Markdown + JSON transcripts)             │
 │  Index: data/morgue.sqlite (rebuilt from the files)       │
 │  Planned: ICS (Phase 4)                                   │
 └───────────────────────────────────────────────────────────┘
```

A single Bun process serves the API. Serving the built frontend from the same process is planned but not wired up yet; in dev, Vite serves the frontend and forwards `/api` to the server.

## Repo layout

A Bun workspaces monorepo, so the frontend and backend live side by side and share types:

```
the-daily-you/
├── apps/
│   ├── web/                 # Frontend: React + Vite + Tailwind + shadcn
│   │   └── src/
│   │       ├── pages/       # chat, journal, entry, memory, settings
│   │       ├── components/
│   │       └── lib/api.ts   # typed client for the server
│   └── server/              # Backend: Bun + Hono
│       └── src/
│           ├── index.ts     # Hono app, mounts routes
│           ├── routes/      # chat, entries, memory, settings
│           ├── agents/      # one folder per agent (config only) + _engine/
│           ├── tools/       # tools agents can use, by name (empty for now)
│           ├── schemas/     # structured outputs agents can return
│           ├── newsroom/    # workflows that use agents (print)
│           ├── llm/         # ollama client
│           └── store/       # entries, sessions (transcripts), dates
├── packages/
│   └── shared/              # zod schemas + TS types shared by web & server
├── spikes/                  # throwaway experiments
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

**Intent (suggest, don't act):** alongside the Reporter's reply, `classifyIntent` asks the router model what your message wants: `chat`, `edit_entry`, `print` or `recall`, as JSON. It sees the Reporter's last question (labelled, not as its own turn) and the headlines of today's pages, so "yeah the driving bit" reads as an answer. `newsroom/suggest.ts` turns `print` and `edit_entry` into a button in the chat ("Go to print?", "Edit page 1?"). The edit button opens that page's Edit box with your message filled in. Nothing happens until you click, and any failure just means no button. `recall` offers nothing until The Morgue exists.

### Reporter

- Conversational interviewer. Streams replies.
- Context it gets now: the date, weekday, time, your name (if set), the facts file (`memory.md`), open threads that are due (up to 3), a past page worth bringing up (if recall found one), and the current chat.
- When it opens a chat and something's due, it asks about one of them instead of a generic "how was your day".
- Planned context: today's calendar events (Phase 4).
- Aim: ask one good follow-up at a time, pick up on threads from past days ("Did the bike hold up?"), and know when there's enough for a story.

### The Morgue (memory, Phase 3, in progress)

Memory is there so the Reporter can ask better questions while you journal. It isn't a search engine for your diary.

**Facts file (built):** `data/memory.md`, plain Markdown you edit on the Memory page. It holds the stuff a friend would just know: where you work, who Priya is, what you're training for. `store/memory.ts` reads it, and `chatContext` in `agents/_engine/run.ts` puts it in the Reporter's prompt every chat turn. `<!-- -->` hint comments and empty sections are stripped first. Every save copies the old file to `data/versions/memory/vN.md`, so it can be undone.

**Open threads (built):** things to follow up on, like an exam, an interview or a rolled ankle. Saved in `data/threads.json` with a `due` date. The Reporter sees open ones once they're due, and they stop showing 14 days after that if nobody answers them. You can dismiss them on the Memory page.

**The Archivist (built):** after each print, `POST /api/print` queues `archivePage` (`newsroom/archive.ts`) in the background, so printing isn't any slower. The Archivist agent reads the printed chat (only your words count), the facts file and the open threads, and returns JSON:

- `facts`: add / update / remove, where update and remove quote the existing line. Code applies them, and skips any that point at a line that isn't there or add something already there, so a bad answer can't mangle the file.
- `threads_new`: what, `when` it happens (a date or nothing), and tone (`light` or `tender`). The model only reads the date off a calendar it's given, labelled "this coming Tuesday" and so on. Code works out when to ask (the day after, or 4 days later if there's no date) and adds the date to the text, e.g. "COMP3000 exam (Tue 6 Oct)".
- `threads_resolved`: open threads this chat answered.

Runs are one at a time, so two quick prints can't both rewrite `memory.md`. Each run that changes something goes into `data/memory-log.json`, which the Memory page shows with an Undo for the newest one. Edits don't re-run it, to avoid learning the same thing twice.

**Recall (built):** bringing up a related past day while you chat. Two parts:

1. **The index** (`morgue/index.ts`): one row per printed page in `data/morgue.sqlite`, with an embedding from the `embed` model (`nomic-embed-text`). Before embedding, the page gets its date and headline put in front ("Saturday 12 September 2026 (2026-09-12). Ankle Down."), since a page on its own loses who and when. `writeEntry` and `deleteEntry` tell the index about every change (print, edit, delete, undo), and it re-embeds a day when its version changes. At startup it catches up with anything it missed. It's only a cache: delete the file and it rebuilds. Vectors are compared in plain JS, which is a few milliseconds for a few hundred pages, so there's no vector extension.
2. **The pick** (`morgue/recall.ts`): after the Reporter replies, in the background, the last few things you said are embedded and compared to every earlier page. The 20 results are chosen with MMR (maximal marginal relevance), so they're relevant but not 15 copies of the same gym day. Each one is labelled "routine" (3+ near-identical days) or "one-off". Then the router model picks the one a friend would bring up, or none. Whatever it picks goes into the Reporter's prompt on the next turn, with how long ago it was worked out in code. At most one per chat. The pick lives in memory rather than the session file, so it can't clash with saving messages.

`bun run eval:recall` checks this on a fake diary. See FINDINGS (2026-10-02) for what changed the numbers.

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

Each request starts with a Task line (front page, new page, or edit), so the same agent and prompt handles all three. The workflows are in `newsroom/`:

**Pages** (`print.ts`, `pages.ts`): each chat printed becomes its own page. A new page gets the earlier pages as context so it doesn't repeat them. The entry's headline is page 1's, its mood is the average of the pages, and tags and people are combined.

**Edits** (`edit.ts`, "change that bit"): the Copy Desk gets the page's current Markdown, the chats it came from and the instruction, and returns the page as JSON again. Only that page is rewritten. The previous version is saved first (see Versioning), so the entry page can offer Undo.

**Only from buttons:** the Copy Desk isn't routable, so chat always goes to the Reporter. An earlier version let the router send "change the headline" messages to it, but a casual reply ("yeah the driving bit") got routed there and rewrote a page, so edits now only happen when you press Edit. The Editor-in-Chief can still offer that button from chat (see above), but it never edits by itself.

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
| `embed` | embeddings for recall | `MODEL_EMBED` | `nomic-embed-text` |

The defaults use one local model for every role, because Ollama keeps a single model loaded and nothing gets swapped in and out. Point any role at a different model, smaller for speed or larger for quality, without touching code.

## Storage

Plain files are the source of truth: entries and the facts file are Markdown, transcripts and threads are JSON. The one SQLite file, `morgue.sqlite`, is an **index** for recall that can always be rebuilt from `data/`.

```
data/
├── entries/
│   └── 2026/
│       └── 09/
│           └── 2026-09-29.md       # the entry (frontmatter + Markdown)
├── memory.md                       # facts file (what the Reporter knows about you)
├── morgue.sqlite                   # recall index (a cache, rebuilt from entries/)
├── memory-log.json                 # what the Archivist changed after each print
├── threads.json                    # things to follow up on
├── versions/
│   ├── 2026-09-29/
│   │   ├── v1.md
│   │   └── v2.md
│   └── memory/                     # old versions of memory.md
│       └── v1.md
├── transcripts/
│   └── 2026-09-29/
│       └── <session-id>.json       # raw chat, kept for re-printing
│
│   planned:
├── media/                          # photos (Phase 6)
└── settings.json                   # name, paper name, dateline, day cutoff, models
```

- **Entry format:** see [ENTRY_FORMAT.md](ENTRY_FORMAT.md).
- **SQLite tables (planned, rough):** `entries` (date, issue, headline, mood, tags, updated_at, hash), `chunks` + `chunks_vec` (embeddings), `chunks_fts`, `sessions`, `events`.
- **Reindex (planned):** on startup, compare file hashes with `entries.hash` and reindex anything that changed. This means hand-editing an entry in a text editor just works.
- **Versioning:** before any overwrite or delete, the current file is copied to `versions/<date>/vN.md`. Restoring a version writes it back as a new version, which is how Undo works. There's no page for browsing old versions yet.

## Main flows

### Chat → print (Phase 1)

```
web: POST /api/sessions                    ──► new transcript for today's diary date
web: POST /api/chat {sessionId}            ──► Reporter opens the interview (SSE)
web: POST /api/chat {sessionId, message}   ──► router ──► Reporter ──► SSE stream of tokens
                                                └─ intent check alongside ──► maybe a suggest event (a button)
web: POST /api/print {sessionId}           ──► newsroom/print.ts → copydesk, using every chat from that day
                                                ├─ transcripts → JSON (schema-constrained, zod-validated, retry once)
                                                ├─ JSON → Markdown (template)
                                                ├─ old version → data/versions/<date>/vN.md
                                                └─ write data/entries/YYYY/MM/<date>.md
                                            ◄── { date, headline, version }
web: navigate to /journal/<date>
```

Printing a chat that's already a page rewrites only that page. A new chat adds a page.

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

- **Local-first:** works offline with Ollama, and your data is plain files you own.
- **Files are truth:** once SQLite is added, it should be safe to delete and rebuild.
- **Code before model:** use deterministic code wherever it works (button routing, Markdown templating), and save LLM calls for what needs them.
- **Small-model friendly:** use structured JSON outputs with validation and retries, plus short focused prompts.
