# Entry format

> **Status:** in use since Phase 1. The schema is `EntryFrontmatter` in `packages/shared/src/index.ts`. `events` stays empty until the calendar lands (Phase 4).

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
sessions: [2026-09-29-a1b2c3d4, 2026-09-29-e5f6a7b8]
version: 2
model: llama3.1:8b
created: 2026-09-29T21:14:03+10:00
updated: 2026-09-29T22:40:51+10:00
---

# Local Man Finally Fixes Bike, Rides 3km, Declares Victory

*Tyre levers, YouTube and sheer stubbornness credited*

**MELBOURNE:** After three weeks of a flat tyre and mounting excuses, ...

## Lecture Hall Report

...

> "Honestly the ride was worth it just for the coffee."
```

## Fields

| Field | Type | Required | Set by | Notes |
| --- | --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | ✅ | server | The diary day (see *day cutoff* below). Must match the filename. |
| `volume` | int | ✅ | server | Year of publication, counted from the first entry (1 = first year). |
| `issue` | int | ✅ | server | Running issue number: the count of entries so far, plus one. A reprint keeps its number. |
| `headline` | string | ✅ | Copy Desk | |
| `subhead` | string | | Copy Desk | |
| `dateline` | string | | server | Place, upper case. Comes from `DATELINE` in `.env` (default `HOME`). |
| `mood` | int 1–10 | | Copy Desk | Inferred from the chat, and the user can edit it. |
| `tags` | string[] | | Copy Desk | Lower-case, short. |
| `people` | string[] | | Copy Desk | Names of people mentioned. |
| `events` | object[] | | server (Phase 4) | From the calendar: `title`, `start`, `end`, optional `location`. |
| `sessions` | string[] | ✅ | server | Chat session IDs merged into this entry. Transcripts live in `data/transcripts/<date>/`. |
| `version` | int | ✅ | server | Increments on every reprint. Old versions go in `data/versions/<date>/`. |
| `model` | string | | server | The model that last wrote the body. |
| `created` / `updated` | ISO 8601 | ✅ | server | With timezone offset. |

## Rules

- **The body is Markdown.** The Copy Desk produces JSON, and a template renders it into the body. You can edit the file by hand, and the app reads it fresh each time. A reprint replaces the body though, so hand edits to the text get overwritten (the old version is still in `versions/`).
- **Unknown frontmatter fields are preserved**, including through reprints, so you can add your own.
- **Day cutoff:** a chat before the cutoff hour (default `04:00`, configurable) belongs to the previous day.
- **One file per day.** Printing again after a second chat rewrites the entry from all of that day's chats. Merging new chats into the existing story is planned for Phase 2.
