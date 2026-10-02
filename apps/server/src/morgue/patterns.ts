/**
 * Patterns: people and topics that used to come up a lot and have gone quiet
 * ("haven't heard about John in a while"), for the Reporter to maybe ask about.
 *
 * Plain counting over each entry's `people` and `tags`, no model call. Gaps are counted
 * in diary entries, not days, so a fortnight off journaling doesn't make everyone look quiet.
 * Results are cached and worked out again whenever an entry changes.
 */
import type { EntryFrontmatter } from "@daily-you/shared";
import { listEntryDates, onEntryChange, readEntry } from "../store/entries";
import { longDate } from "./index";
import { ago } from "./recall";

/** What a pattern is worked out from: one entry's date, people and tags. */
export type Day = Pick<EntryFrontmatter, "date" | "people" | "tags"> & {
  /** Headline of each page, with that page's people and tags, to say what the last mention was about. */
  pages: { headline: string; people: string[]; tags: string[] }[];
};

export type Quiet = {
  kind: "person" | "topic";
  name: string;
  /** How many entries mention them. */
  count: number;
  lastSeen: string;
  /** Headline of the last page that mentions them. */
  lastHeadline: string;
  /** Entries written since they last came up. */
  since: number;
};

// Only look this far back, so someone from two years ago isn't "quiet".
const LOOKBACK_ENTRIES = 120;
// Mentioned on fewer entries than this is too little to call a habit.
const MIN_COUNT = 3;
// Quiet once missing for this many times the usual gap, and at least MIN_SINCE entries.
// In a simulation of people mentioned at random, 3 flagged someone in 40% of weeks
// though nobody had stopped; 4 brings that to 22%, and still notices someone from
// every fortnight about 6 weeks after they stop...
const GAP_FACTOR = 4;
const MIN_SINCE = 5;
// ...and at least this many days, so a busy week of entries doesn't count as "a while".
const MIN_DAYS = 10;
// After this long it isn't "a while" any more, it's just over. Stop bringing it up.
const MAX_DAYS = 120;

const key = (s: string) => s.trim().toLowerCase();

/**
 * Who and what has gone quiet as of `today`, most overdue first, people before topics.
 * `days` can be in any order; entries on or after `today` are ignored.
 */
export function findQuiet(days: Day[], today: string): Quiet[] {
  const past = days
    .filter((d) => d.date < today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-LOOKBACK_ENTRIES);
  const daysAgo = (date: string) => Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${date}T12:00:00`)) / 86_400_000);

  const found: (Quiet & { overdue: number })[] = [];
  for (const kind of ["person", "topic"] as const) {
    const field = kind === "person" ? "people" : "tags";
    // name -> indexes into `past` of the entries that mention it, plus how it was first written.
    const seen = new Map<string, { name: string; at: number[] }>();
    past.forEach((d, i) => {
      for (const raw of new Set(d[field].map(key))) {
        const name = d[field].find((n) => key(n) === raw)!;
        const s = seen.get(raw) ?? { name, at: [] };
        s.at.push(i);
        seen.set(raw, s);
      }
    });

    for (const [k, { name, at }] of seen) {
      if (at.length < MIN_COUNT) continue;
      const last = at.at(-1)!;
      const since = past.length - 1 - last;
      // Average entries between mentions, from the first mention to the last.
      const gap = (last - at[0]!) / (at.length - 1);
      const lastSeen = past[last]!.date;
      const days = daysAgo(lastSeen);
      if (since < Math.max(MIN_SINCE, GAP_FACTOR * gap) || days < MIN_DAYS || days > MAX_DAYS) continue;
      const page = [...past[last]!.pages].reverse().find((p) => p[field].some((n) => key(n) === k));
      found.push({
        kind,
        name,
        count: at.length,
        lastSeen,
        lastHeadline: page?.headline ?? past[last]!.pages[0]?.headline ?? "",
        since,
        overdue: since / Math.max(gap, 1),
      });
    }
  }
  return found
    .sort((a, b) => (a.kind === b.kind ? b.overdue - a.overdue : a.kind === "person" ? -1 : 1))
    .map(({ overdue: _, ...q }) => q);
}

/** One line per pattern, for the Reporter's prompt. */
export function formatQuiet(quiet: Quiet[], today: string): string {
  return quiet
    .map((q) => {
      const about = q.lastHeadline ? `, on the page "${q.lastHeadline}"` : "";
      const what = q.kind === "person" ? q.name : `${q.name} (a topic)`;
      return `- ${what}: came up in ${q.count} entries, then nothing for the last ${q.since}. Last mentioned ${longDate(q.lastSeen)} (${ago(q.lastSeen, today)})${about}.`;
    })
    .join("\n");
}

let cache: Promise<Day[]> | null = null;
onEntryChange(() => {
  cache = null;
});

async function loadDays(): Promise<Day[]> {
  const days: Day[] = [];
  for (const date of await listEntryDates()) {
    try {
      const { frontmatter: f } = (await readEntry(date))!;
      days.push({ date: f.date, people: f.people, tags: f.tags, pages: f.pages });
    } catch (e) {
      console.warn(`Patterns: skipping unreadable entry ${date}:`, e);
    }
  }
  return days;
}

/** Who and what has gone quiet as of `today`, from the entries on disk. */
export async function quietFor(today: string): Promise<Quiet[]> {
  cache ??= loadDays();
  try {
    return findQuiet(await cache, today);
  } catch (e) {
    cache = null;
    throw e;
  }
}
