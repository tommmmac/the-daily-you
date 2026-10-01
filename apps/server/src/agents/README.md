# Agents

Each agent (a "desk" in the newsroom) is a folder of config, with no code in it. Folders are
found automatically at startup by [_engine/loader.ts](_engine/loader.ts).

```
src/agents/<name>/
  manifest.yaml   settings: what it does, which model, tools and output
  agent.md        the system prompt
  README.md       2–3 sentences for humans about what it does
```

The code agents use lives elsewhere, so it can be shared:

| Folder | What's in it | How agents use it |
| --- | --- | --- |
| `src/tools/` | Tools the model can call (e.g. `recall`) | `tools: [recall]` |
| `src/schemas/` | Structured outputs (e.g. `story`) | `output: story` |
| `src/newsroom/` | Workflows that *use* agents (e.g. printing) | Not referenced by agents; they call agents |
| `_engine/` | Loader, registry, router (Editor-in-Chief), runner | You shouldn't need to touch it |

## manifest.yaml

```yaml
name: <name>            # must match the folder name; it's what the router answers with
description: <text>     # shown to the router, and the only thing it uses to decide
enabled: true           # false disables the agent without deleting it
routable: true          # false = only reachable from code/buttons, never from free-text chat
model: reporter         # which model setting: router | reporter | copydesk (default: the agent's name)
tools: [recall]         # optional: names from src/tools/index.ts
output: story           # optional: a name from src/schemas/index.ts; the reply is JSON matching it

# Optional. Only used if the router's LLM call fails or answers with junk:
# if exactly one agent's keywords appear in the message, route to it.
triggers:
  keywords: [word, another phrase]
```

Every reference is checked at startup. A typo in a tool, output or model name stops the server with a clear error, so it can't fail silently later.

## agent.md

The system prompt. These placeholders are filled in fresh for every message:

| Placeholder | Example |
| --- | --- |
| `{{date}}` | `2026-09-30` (the diary day, after the day cutoff) |
| `{{weekday}}` | `Wednesday` |
| `{{time}}` | `9:14 pm` |
| `{{name}}` | `USER_NAME` from `.env`, or "the diarist" |
| `{{facts}}` | The facts file (`data/memory.md`) without hints or empty sections. Chat agents only. |
| `{{threads}}` | Open threads that are due, one per line. Chat agents only. |
| `{{recalled}}` | A past page worth bringing up, picked after the previous turn (`morgue/recall.ts`). Chat agents only. |

It uses double braces, so single braces in example JSON are safe.

## How agents run

**Chat agents** (no `output`) go through `chat()` in `_engine/run.ts`:

```
POST /api/chat ─► chat()
                    1. route(message)       router.ts picks a routable agent
                                            (no model call if only one is routable)
                    2. runAgent(agent, ...)  system prompt + session history
                                            (+ any tool calls, then a grounding reminder)
                                            → streams the reply
                    3. save both turns       to the session transcript, tagged with the agent
```

Every agent in a session reads and writes the same transcript, so switching desks mid-conversation keeps context.

**Structured agents** (with `output`) are called from a workflow with `runStructured(agent, input, ctx)`. The model is forced to reply with JSON in that schema, the reply is checked with zod, and it retries once if the check fails.

## Adding a desk

1. Copy `reporter/` and rename the folder.
2. Edit `manifest.yaml`, especially `name` and `description`, since the router picks agents by description.
3. Write the prompt in `agent.md` and a couple of sentences in `README.md`.
4. If it needs a new tool or output format, add it to `src/tools/` or `src/schemas/` first.

## Current desks

| Agent | Routable | What it does |
| --- | --- | --- |
| [`reporter`](reporter/) | yes (default) | Interviews you about your day |
| [`copydesk`](copydesk/) | no (Go to print and Edit buttons) | Turns a chat into a page, and rewrites a page when you ask |

The Morgue (with a `recall` tool) arrives in Phase 3.
