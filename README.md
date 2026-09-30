# The Daily You

[![CI](https://github.com/tommmmac/the-daily-you/actions/workflows/ci.yml/badge.svg)](https://github.com/tommmmac/the-daily-you/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> *All the news that's fit to journal.*

**The Daily You** is an open source, local-first AI diary. You chat about your day, and it gets printed as a neatly formatted, news-style Markdown entry for that date: a headline, a lede, and the story of your day.

Your entries are plain Markdown files on your own machine. The AI runs locally through [Ollama](https://ollama.com) by default, and you can add a Claude or OpenAI key if you want.

> **Status:** early development. The first edition works: chat about your day, go to print, and read it back. See the [Roadmap](ROADMAP.md).

## Why

I'm building this to learn how agent systems and memory systems actually work, by using them on something personal.

It's also an experiment in how far agents can go at journaling. The questions I want to answer:

- **Interviewing:** can an agent ask good enough questions to get the real story of your day, not just a summary?
- **Memory:** can it remember the people, projects and threads in your life well enough to follow up ("did the bike hold up?") without making things up?
- **Writing:** can a model write something you'd actually want to read back, and where does it break (inventing facts, misreading slang, flat writing)?
- **Routing:** does splitting the work across specialised agents beat one big prompt?

Everything runs locally with Ollama, because a diary is about the most personal data there is.

### Findings so far

- **Slang breaks the whole pipeline.** "Was sick" (meaning great) got printed as "Local Developer Battles Through Illness".
- **The interviewer's guesses leak into the story.** The Copy Desk treated the Reporter's questions as facts.
- **Small models need structure.** The model fills a JSON schema and code does the layout; that's far more reliable than asking for formatted text.
- **Speed is about loading.** About 77s for the first print, 9–13s once the model is loaded.

The full write-ups, with examples and what I changed, are in [docs/FINDINGS.md](docs/FINDINGS.md).

---

## How it works

1. **Open the app** (on your desktop, or your phone via Tailscale) and start chatting.
2. **The Reporter interviews you.** It knows what's on your calendar and what you wrote about recently, so it asks better questions than "how was your day?"
3. **Go to print.** The Copy Desk turns the conversation into a newspaper-style entry with a headline and saves it as `2026-09-29.md`.
4. **Read it back.** Browse past issues, search them, or ask "when did I last see Sam?"

```markdown
---
date: 2026-09-29
issue: 42
headline: "Local Man Finally Fixes Bike, Rides 3km, Declares Victory"
mood: 7
tags: [cycling, uni]
---

# Local Man Finally Fixes Bike, Rides 3km, Declares Victory

**MELBOURNE** — After three weeks of a flat tyre and mounting excuses, ...
```

## The newsroom (agents)

| Agent | Role |
| --- | --- |
| **Editor-in-Chief** | The conductor. Routes each message to the right agent. Buttons use plain code; free text goes through a small model that returns an intent (`chat`, `edit_entry`, `recall`, `print`). When unsure, it goes to the Reporter. |
| **Reporter** | Interviews you about your day, using your calendar and past entries. |
| **The Morgue** | Memory: semantic search over past entries plus a facts file (people, projects, goals). |
| **Copy Desk** | Turns the chat into an entry with a headline, handles edits ("change that bit"), and goes to print. |

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

- **Frontend:** React + Vite + Tailwind + shadcn/ui, installable as a PWA
- **Backend:** Bun + Hono API server, which runs the agents and handles files and calendar
- **Storage:** one Markdown file per day, SQLite for metadata, `sqlite-vec` for embeddings
- **AI:** Ollama running natively; optional Claude/OpenAI API key
- **Phone access:** Tailscale (HTTPS, works away from home)

## Getting started

Prerequisites:

- [Bun](https://bun.sh) 1.x
- [Ollama](https://ollama.com) with a chat model pulled. The default is `qwen2.5:14b` (`ollama pull qwen2.5:14b`); any model works, set in `.env`
- (optional) [Tailscale](https://tailscale.com) for phone access

```bash
git clone https://github.com/tommmmac/the-daily-you.git
cd the-daily-you
bun install
bun run dev
```

Then open http://localhost:5173. The server runs on port 3000, and Vite forwards `/api` requests to it. Your diary is saved in `data/`.

To use a different model, set `MODEL_REPORTER`, `MODEL_COPYDESK` or `MODEL_ROUTER` (see `apps/server/src/config.ts`).

## Docs

- [ROADMAP.md](ROADMAP.md): phases, tasks and open questions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit together
- [docs/ENTRY_FORMAT.md](docs/ENTRY_FORMAT.md): the entry file format (draft)
- [docs/API.md](docs/API.md): API routes (draft)
- [docs/FINDINGS.md](docs/FINDINGS.md): what I have learned so far
- [CONTRIBUTING.md](CONTRIBUTING.md): how to work on it

## Privacy

Everything lives in your `data/` folder: Markdown, SQLite, and nothing else. With Ollama, nothing leaves your machine. If you turn on a cloud model, your chat and entry text go to that provider. The app will always say clearly which model is in use.

## License

[MIT](LICENSE)
