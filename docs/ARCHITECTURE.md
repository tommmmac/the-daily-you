# Architecture

How The Daily You fits together. It covers what's built and what's planned, and planned parts are marked with the phase they belong to (see the [Roadmap](../ROADMAP.md)). Keep it up to date when something changes.

## What's built so far

Phase 1: the Reporter and Copy Desk agents, the agent engine and router, chat with streaming, printing to Markdown, and a web app with chat, journal and entry pages.

From Phase 2: pages (each printed chat adds a page to the day), editing a page through the Copy Desk (the Edit button on each page), deleting pages and entries, and undo through saved versions. From Phase 3: a facts file the Reporter reads every chat, the Archivist, which updates it and keeps a list of things to follow up on after each print, and recall of related past days while you chat. From Phase 4: your calendars' events in the Reporter's context and in each entry. From Phase 5: the server serves the built app, which installs as a PWA on the computer and on phones, phones sign in with a passphrase through Tailscale, and a nightly push reminder. Everything runs on Ollama. Plain files are the source of truth, with a SQLite index for recall that can always be rebuilt. There are no cloud models yet.

## Big picture

```
 ┌──────────────────────────┐
 │  Browser or installed app│   phones through tailscale serve
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
 │  Calendars: ICS links, fetched and cached (calendar/)     │
 └───────────────────────────────────────────────────────────┘
```

A single Bun process serves the API and, once `bun run build` has made `apps/web/dist`, the app itself (`web.ts`): files from the build, and `index.html` for any other path so React Router can handle `/journal/2026-10-03`. Files under `assets/` have hashes in their names, so they're cached for good, and everything else is checked each time. In dev, Vite serves the frontend and forwards `/api` to the server.

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
├── tools/                # tools any agent can list in `tools: [...]` (none yet: memory and calendar go in the prompt)
├── schemas/              # structured outputs agents can return (`story`)
├── newsroom/             # workflows that use agents, e.g. print.ts
├── morgue/               # memory: the recall index, recall and patterns
├── calendar/             # reading ICS links: ics.ts (parsing), feeds.ts (fetching and caching)
├── auth.ts               # who's local, passphrase and sessions (data/auth.json)
├── push.ts               # the nightly reminder (data/push.json)
└── web.ts                # serves the built app
```

- **Personas, capabilities, workflows.** Agents are *who* (a prompt and settings). `tools/` and `schemas/` are *what they can do*, shared by name. `newsroom/` is *when things happen*: code that calls agents, like printing.
- **Auto-discovered and checked.** At startup the loader scans for folders with a `manifest.yaml`. It stops with a clear error if a manifest names a tool, output or model that doesn't exist. Adding an agent means adding a folder.
- **One entry point for chat.** Every chat turn goes through `chat()` in `_engine/run.ts`: route → run the agent with the session history (resolving any tool calls, then adding a grounding reminder) → save both turns, tagged with the agent that answered.
- **Structured output.** Agents with `output:` are called with `runStructured()`. The model is forced to reply with JSON in that schema, the reply is checked with zod, and it retries once if the check fails.
- **Shared session memory.** All agents in a session read and write the same transcript, so switching desks mid-conversation keeps context. Each agent only gets its own replies as its own turns; another desk's reply goes in as a note saying who wrote it.

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
- Context it gets now: the date, weekday, time, your name (if set), the facts file (`memory.md`), open threads that are due (up to 3), a past page worth bringing up (if recall found one), up to 2 people or topics that have gone quiet, the day's calendar events, and the current chat.
- When it opens a chat and something's due, it asks about one of them instead of a generic "how was your day".
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

**Patterns (built):** people and topics that used to come up a lot and have gone quiet ("haven't heard about John in a while"). `morgue/patterns.ts` counts each entry's `people` and `tags`, no model involved. Something counts as quiet when it was in at least 3 of the last 120 entries, and it's been missing for 4 times its usual gap (at least 5 entries and 10 days). Gaps are counted in entries, not days, so a fortnight off journaling doesn't make everyone look quiet. After 120 days it's dropped, since by then it's just over. The Reporter gets up to 2 (people first) with how long ago and the headline of the last page they were on, and is told it doesn't know *why* they've gone quiet. Worked out once and cached until an entry changes.

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
├── settings.json                   # everything on the Settings page
├── auth.json                       # passphrase hash and signed-in devices (hashed)
├── push.json                       # reminder keys and each device's subscription
│
│   planned:
└── media/                          # photos (Phase 7)
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

## Calendar (Phase 4, built)

- **Settings:** paste one or more ICS links (Google, iCloud or Outlook "secret address"; `webcal://` works too). Adding one checks it first (`POST /api/calendar/test`), names it after the calendar's own name, and says how many events it has today. Each can be switched off without removing it. Saved in `data/settings.json` only, never in `.env`, since the links are private.
- **Reading them** (`calendar/ics.ts`): `ical.js` parses the file, registers its time zones, and expands recurring events. Moved or changed occurrences ("this week's lecture is in another room") replace their slot in the series, and cancelled ones are left out. A day is midnight to midnight, local time. All-day events are saved as plain dates, with the end exclusive like ICS.
- **Fetching** (`calendar/feeds.ts`): each link is cached for 15 minutes, with an 8 second timeout. If a fetch fails, the last good copy is used. Links never go in the logs, only the calendar's name.
- **The Reporter** gets the day's events as `{{events}}`, with times worked out in code ("10:00 am to 12:00 pm: FIT2004 Lecture, at Clayton [Uni]"). Anything that hasn't started yet is marked, so it's asked about as a plan. It's told the calendar is what was planned, not what happened.
- **On print**, the day's events are written to the entry's `events` frontmatter. If a calendar can't be read right then, the events saved before are kept.

## App, phones and sign-in (Phase 5, built)

- **The app:** `vite-plugin-pwa` adds a manifest and a service worker, so Chrome and Edge offer to install it, and phones can add it to the home screen. The service worker caches the app itself, never `/api`, so diary data is always fresh. Settings has an Install button when the browser offers one (`lib/install.ts`).
- **Starting with Windows:** `bun run autostart` (`scripts/autostart.ts`) puts a small VBScript in the Startup folder that runs `bun run build` and `bun run start` with no window, logging to `logs/server.log`.
- **Phones** reach the computer through `tailscale serve`, which gives HTTPS on the tailnet (needed for the PWA and push) and proxies to `127.0.0.1:3000`. The server still only listens on localhost. Setup is in [PHONE.md](PHONE.md).
- **Who's local** (`auth.ts`): a request from a loopback address, to localhost, with no forwarding headers, is the computer itself and is always let in. `tailscale serve` also connects from 127.0.0.1, but it always adds `X-Forwarded-For`, so anything with forwarding headers counts as another device. Headers can be added but not taken away, so a phone can't pass itself off as the computer.
- **Signing in:** other devices need a session cookie (`dy_session`, HttpOnly, SameSite=Lax, a year). They get one by typing the passphrase, which is only set, changed or turned off from the computer. `data/auth.json` keeps the passphrase's hash (`Bun.password`, argon2id) and a SHA-256 of each session token, so the file alone can't sign anyone in. Changing the passphrase signs every device out. After 5 wrong tries in 15 minutes, logins wait, for everyone at once, since every phone comes through the same proxy.
- **Reminder** (`push.ts`): Web Push with VAPID keys made on first use, in `data/push.json` with each device's subscription. Once a minute the server checks whether it's past the reminder time (and at most 3 hours past, so a computer that wakes up late doesn't send a stale one), whether it's been sent for that diary day, and whether there's an entry yet. The service worker (`public/push-sw.js`) shows it and opens the chat when it's tapped. Devices the push service says are gone are forgotten.

## Principles

- **Local-first:** works offline with Ollama, and your data is plain files you own.
- **Files are truth:** once SQLite is added, it should be safe to delete and rebuild.
- **Code before model:** use deterministic code wherever it works (button routing, Markdown templating), and save LLM calls for what needs them.
- **Small-model friendly:** use structured JSON outputs with validation and retries, plus short focused prompts.
