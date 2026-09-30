# The Daily You

> *All the news that's fit to journal.*

**The Daily You** is an open source, local-first AI diary. You chat about your day, and it gets printed as a neatly formatted, news-style Markdown entry for that date: a headline, a lede, and the story of your day.

Your entries are plain Markdown files on your own machine. The AI runs locally through [Ollama](https://ollama.com) by default, and you can add a Claude or OpenAI key if you want.

> **Status:** early development, nothing runnable yet. See the [Roadmap](ROADMAP.md).

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

> Not ready yet. This section will be filled in during Phase 0.

Prerequisites (planned):

- [Bun](https://bun.sh) 1.x
- [Ollama](https://ollama.com) with at least one chat model and one embedding model pulled
- (optional) [Tailscale](https://tailscale.com) for phone access

```bash
git clone https://github.com/tommmmac/the-daily-you.git
cd the-daily-you
bun install
bun run dev
```

## Docs

- [ROADMAP.md](ROADMAP.md): phases, tasks and open questions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit together
- [docs/ENTRY_FORMAT.md](docs/ENTRY_FORMAT.md): the entry file format (draft)
- [docs/API.md](docs/API.md): API routes (draft)
- [CONTRIBUTING.md](CONTRIBUTING.md): how to work on it

## Privacy

Everything lives in your `data/` folder: Markdown, SQLite, and nothing else. With Ollama, nothing leaves your machine. If you turn on a cloud model, your chat and entry text go to that provider. The app will always say clearly which model is in use.

## License

[MIT](LICENSE)
