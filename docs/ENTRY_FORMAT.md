# Entry format (draft)

> **Status:** draft for Phase 0. Settle this before building, because both the frontend and backend depend on it.

Each day is one Markdown file with YAML frontmatter:

`data/entries/YYYY/MM/YYYY-MM-DD.md`

## Example

```markdown
---
date: 2026-09-29
volume: 1
issue: 42
headline: "Local Man Finally Fixes Bike, Rides 3km, Declares Victory"
subhead: "Tyre levers, YouTube and sheer stubbornness credited"
dateline: MELBOURNE
mood: 7
tags: [cycling, uni]
people: [Sam]
events:
  - title: "FIT2004 Lecture"
    start: 2026-09-29T10:00:00+10:00
    end: 2026-09-29T12:00:00+10:00
sessions: [01J9Z6K8Q2, 01J9Z9M4T1]
version: 2
model: llama3.1:8b
created: 2026-09-29T21:14:03+10:00
updated: 2026-09-29T22:40:51+10:00
---

# Local Man Finally Fixes Bike, Rides 3km, Declares Victory

*Tyre levers, YouTube and sheer stubbornness credited*

**MELBOURNE** — After three weeks of a flat tyre and mounting excuses, ...

## Lecture Hall Report

...

> "Honestly the ride was worth it just for the coffee." — the author
```

## Fields

| Field | Type | Required | Set by | Notes |
| --- | --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | ✅ | server | The diary day (see *day cutoff* below). Must match the filename. |
| `volume` | int | ✅ | server | Year of publication, counted from the first entry (1 = first year). |
| `issue` | int | ✅ | server | Running issue number. TBD: count of entries, or days since first entry? |
| `headline` | string | ✅ | Copy Desk | |
| `subhead` | string | | Copy Desk | |
| `dateline` | string | | Copy Desk | Place, upper case. Falls back to a default in settings. |
| `mood` | int 1–10 | | Copy Desk | Inferred from the chat, and the user can edit it. |
| `tags` | string[] | | Copy Desk | Lower-case, short. |
| `people` | string[] | | Copy Desk | Names as used in `memory.md`. |
| `events` | object[] | | server (Phase 4) | From the calendar: `title`, `start`, `end`, optional `location`. |
| `sessions` | string[] | ✅ | server | Chat session IDs merged into this entry. Transcripts live in `data/transcripts/<date>/`. |
| `version` | int | ✅ | server | Increments on every edit. Old versions go in `data/versions/<date>/`. |
| `model` | string | | server | The model that last wrote the body. |
| `created` / `updated` | ISO 8601 | ✅ | server | With timezone offset. |

## Rules

- **The body is Markdown.** The Copy Desk produces JSON, and a template renders it into the body. Hand edits to the file are allowed and are picked up on reindex.
- **Unknown frontmatter fields are preserved**, so users and future features can add their own.
- **Day cutoff:** a chat before the cutoff hour (default `04:00`, configurable) belongs to the previous day.
- **One file per day.** A second chat on the same day is merged into the same entry, not saved as a new file.
