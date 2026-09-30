# The Daily You

[![CI](https://github.com/tommmmac/the-daily-you/actions/workflows/ci.yml/badge.svg)](https://github.com/tommmmac/the-daily-you/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> *All the news that's fit to journal.*

The Daily You is a local AI diary. You chat about your day, then hit "Go to print" and it writes up the chat as a newspaper-style Markdown entry for that date, with a headline and a short write-up.

Entries are plain Markdown files on your machine, and the model runs locally through [Ollama](https://ollama.com).

> **Status:** early and rough. The basic loop works: chat about your day, print it, read it back. Most of the interesting parts (memory, calendar, editing entries) aren't built yet. See the [Roadmap](ROADMAP.md).

## Why

I'm building this to learn how agent and memory systems work by using them on something personal.

It's also an experiment in how well agents can do journaling. Things I want to find out:

- Can an agent ask good enough questions to get the actual story of your day, not just a summary?
- Can it remember the people and things going on in your life well enough to follow up on them without making stuff up?
- Can a model write something you'd want to read back, and where does it fall over (inventing facts, misreading slang, boring writing)?
- Does splitting the work across a few agents beat one big prompt?

It runs on Ollama because a diary is about as personal as data gets.

Notes on what I've found so far are in [docs/FINDINGS.md](docs/FINDINGS.md).

## What it does right now

1. Open the app at localhost and start chatting.
2. The Reporter agent asks you about your day, one question at a time.
3. Hit "Go to print". The Copy Desk agent turns that day's chats into an entry and saves it to `data/entries/2026/09/2026-09-29.md`. Printing again rewrites the entry and keeps the old one in `data/versions/`.
4. Browse past entries in the journal view.

An entry looks roughly like this:

```markdown
---
date: 2026-09-29
issue: 42
headline: Local Man Finally Fixes Bike, Rides 3km, Declares Victory
subhead: Three weeks of excuses come to an end
mood: 7
tags: [cycling, uni]
---

# Local Man Finally Fixes Bike, Rides 3km, Declares Victory

*Three weeks of excuses come to an end*

**MELBOURNE:** After three weeks of a flat tyre and mounting excuses, ...
```

The full list of fields is in [docs/ENTRY_FORMAT.md](docs/ENTRY_FORMAT.md).

## Agents

Each agent is a folder under `apps/server/src/agents/` with a prompt and a small config file, and they're picked up automatically.

| Agent | What it does now |
| --- | --- |
| Reporter | Interviews you about your day. It's the default for any chat message. |
| Copy Desk | Turns the day's chats into the entry. Only runs when you hit "Go to print". |

There's also a router (the "Editor-in-Chief") that picks an agent for each chat message, with a keyword fallback if the model call fails. Right now the Reporter is the only agent it can route to, so it just skips the model call.

Planned, not built yet:

- The Morgue: memory. Search over past entries and a facts file (people, projects, goals), so the Reporter can ask about things you mentioned before.
- Calendar: feed your events into the Reporter so it has something to ask about.
- Editing entries through chat ("change that bit").

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the [Roadmap](ROADMAP.md).

## Stack

- Frontend: React, Vite, Tailwind, shadcn/ui
- Backend: Bun and Hono, which run the agents and read/write the files
- Storage: one Markdown file per day, chat transcripts as JSON
- AI: Ollama

## Getting started

You'll need:

- [Bun](https://bun.sh) 1.x
- [Ollama](https://ollama.com) with a chat model pulled. The default is `qwen2.5:14b` (`ollama pull qwen2.5:14b`), but you can use any model by setting it in `.env`

```bash
git clone https://github.com/tommmmac/the-daily-you.git
cd the-daily-you
bun install
bun run dev
```

Then open http://localhost:5173. The server runs on port 3000 and Vite forwards `/api` requests to it. Your diary is saved in `data/`.

To use a different model, set `MODEL_REPORTER`, `MODEL_COPYDESK` or `MODEL_ROUTER` (see `apps/server/src/config.ts`).

## Docs

- [ROADMAP.md](ROADMAP.md): phases, tasks and open questions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit together
- [docs/ENTRY_FORMAT.md](docs/ENTRY_FORMAT.md): the entry file format (draft)
- [docs/API.md](docs/API.md): API routes (draft)
- [docs/FINDINGS.md](docs/FINDINGS.md): what I've learned so far
- [CONTRIBUTING.md](CONTRIBUTING.md): how to work on it

## Privacy

Everything is stored in your `data/` folder as Markdown and JSON. The model runs through Ollama on your machine, so nothing gets sent anywhere. The server only listens on localhost by default.

## License

[MIT](LICENSE)
