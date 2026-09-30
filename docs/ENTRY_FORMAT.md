# Entry format

> **Status:** in use since Phase 1. The schema is `EntryFrontmatter` in `packages/shared/src/index.ts`. `events` stays empty until the calendar lands (Phase 4).

Each day is one Markdown file with YAML frontmatter:

`data/entries/YYYY/MM/YYYY-MM-DD.md`

A day can have several pages. The first chat you print is page 1 (the front page), and each chat printed after that adds a page to the end.

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
pages:
  - headline: "Local Man Finally Fixes Bike, Rides 3km, Declares Victory"
    subhead: "Tyre levers, YouTube and sheer stubbornness credited"
    mood: 6
    tags: [cycling, uni]
    people: [Sam]
    sessions: [2026-09-29-a1b2c3d4]
  - headline: "Evening Ride Ends in Kebab"
    subhead: "Correspondent refuels after second outing"
    mood: 8
    tags: [cycling]
    people: []
    sessions: [2026-09-29-e5f6a7b8]
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

<!-- page 2 -->

---

# Evening Ride Ends in Kebab

...
```

## Fields

| Field | Type | Required | Set by | Notes |
| --- | --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | ✅ | server | The diary day (see *day cutoff* below). Must match the filename. |
| `volume` | int | ✅ | server | Year of publication, counted from the first entry (1 = first year). |
| `issue` | int | ✅ | server | Running issue number: the count of entries so far, plus one. A reprint keeps its number. |
| `headline` | string | ✅ | Copy Desk | The front page's headline. |
| `subhead` | string | | Copy Desk | The front page's subhead. |
| `dateline` | string | | server | Place, upper case. Set on the Settings page, or `DATELINE` in `.env` (default `HOME`). |
| `mood` | int 1–10 | | Copy Desk | The average of the pages' moods, rounded. |
| `tags` | string[] | | Copy Desk | Every page's tags. Lower-case, short. |
| `people` | string[] | | Copy Desk | Every page's people. |
| `events` | object[] | | server (Phase 4) | From the calendar: `title`, `start`, `end`, optional `location`. |
| `sessions` | string[] | ✅ | server | Every chat session ID on any page. Transcripts live in `data/transcripts/<date>/`. |
| `pages` | object[] | | server | One per page, in order: `headline`, `subhead`, `mood`, `tags`, `people`, and the `sessions` it was printed from. The day-level fields above are worked out from these. Entries from before pages existed don't have it, and their whole body counts as page 1. |
| `version` | int | ✅ | server | Increments on every change (print, edit, delete). Old versions go in `data/versions/<date>/`. |
| `model` | string | | server | The model that last wrote the body. |
| `created` / `updated` | ISO 8601 | ✅ | server | With timezone offset. |

## Rules

- **The body is Markdown.** The Copy Desk produces JSON, and a template renders it into the body. You can edit the file by hand, and the app reads it fresh each time. Editing a page through the app starts from the page's current text, so hand edits are kept. Reprinting a page replaces it, though (the old version is still in `versions/`).
- **Pages:** each page after the first starts with a `<!-- page N -->` comment and a `---` rule. The app renumbers them when a page is deleted. A `---` on its own is just a rule, not a new page.
- **Unknown frontmatter fields are preserved**, including through reprints and edits, so you can add your own.
- **Day cutoff:** a chat before the cutoff hour (default `04:00`, configurable) belongs to the previous day.
- **One file per day.** A new chat becomes a new page. Printing a chat that's already a page rewrites just that page. Chats from that day that were never printed go onto the next new page, except ones whose page was deleted (they're marked `dropped` in their transcript).
