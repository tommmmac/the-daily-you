import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Entry } from "@daily-you/shared";
import type { Day } from "../src/morgue/patterns";

const dataDir = await mkdtemp(join(tmpdir(), "daily-you-patterns-"));
process.env.DATA_DIR = dataDir;
const { addDays } = await import("../src/store/dates");
const entries = await import("../src/store/entries");
const { findQuiet, formatQuiet, quietFor } = await import("../src/morgue/patterns");

afterAll(() => rm(dataDir, { recursive: true, force: true }));

const START = "2026-06-01";
const day = (n: number, people: string[] = [], tags: string[] = []): Day => ({
  date: addDays(START, n),
  people,
  tags,
  pages: [{ headline: `Day ${n}`, people, tags }],
});
/** An entry every day for `n` days, with `extra(i)` adding people and tags to day i. */
const diary = (n: number, extra: (i: number) => [string[], string[]] = () => [[], []]) =>
  Array.from({ length: n }, (_, i) => day(i, ...extra(i)));

describe("findQuiet", () => {
  test("someone who came up weekly and then stopped is quiet", () => {
    // John every 7 days up to day 28, then 30 days of nothing.
    const days = diary(60, (i) => [i % 7 === 0 && i <= 28 ? ["John"] : [], []]);
    const today = addDays(START, 60);
    const [john] = findQuiet(days, today);
    expect(john).toMatchObject({ kind: "person", name: "John", count: 5, lastSeen: addDays(START, 28), since: 31 });
    expect(john!.lastHeadline).toBe("Day 28");
  });

  test("someone still turning up as usual isn't", () => {
    const days = diary(60, (i) => [i % 7 === 0 ? ["John"] : [], []]);
    expect(findQuiet(days, addDays(START, 60))).toEqual([]);
  });

  test("someone who rarely came up is too little to go on", () => {
    const days = diary(60, (i) => [i === 3 || i === 10 ? ["Sally"] : [], []]);
    expect(findQuiet(days, addDays(START, 60))).toEqual([]);
  });

  test("a break from journaling doesn't make everyone quiet", () => {
    // John on most days, then no entries at all for a month: no entries were written without him.
    const days = diary(20, (i) => [i % 2 === 0 ? ["John"] : [], []]);
    expect(findQuiet(days, addDays(START, 50))).toEqual([]);
  });

  test("a few days off isn't 'a while', even for someone who's always there", () => {
    // John every day up to day 9. A week later it's too soon, nearly three weeks later it isn't.
    const days = diary(30, (i) => [i < 10 ? ["John"] : [], []]);
    expect(findQuiet(days.slice(0, 17), addDays(START, 17))).toEqual([]);
    expect(findQuiet(days.slice(0, 27), addDays(START, 27))).toHaveLength(1);
  });

  test("long gone is over, not quiet", () => {
    const days = diary(200, (i) => [i < 20 && i % 2 === 0 ? ["Ex"] : [], []]);
    expect(findQuiet(days, addDays(START, 200))).toEqual([]);
  });

  test("names match whatever their case, people come before topics", () => {
    const days = diary(60, (i) => (i <= 20 && i % 5 === 0 ? [[i % 2 ? "john" : "John"], ["climbing"]] : [[], []]));
    const quiet = findQuiet(days, addDays(START, 60));
    expect(quiet.map((q) => [q.kind, q.name])).toEqual([
      ["person", "John"],
      ["topic", "climbing"],
    ]);
  });

  test("ignores entries from today on", () => {
    const days = diary(60, (i) => [i % 7 === 0 && i <= 28 ? ["John"] : [], []]);
    days.push({ ...day(60, ["John"]) });
    expect(findQuiet(days, addDays(START, 60))).toHaveLength(1);
  });
});

describe("formatQuiet", () => {
  test("says when and where they last came up", () => {
    const days = diary(60, (i) => [[], i % 7 === 0 && i <= 28 ? ["climbing"] : []]);
    const today = addDays(START, 60);
    expect(formatQuiet(findQuiet(days, today), today)).toBe(
      '- climbing (a topic): came up in 5 entries, then nothing for the last 31. Last mentioned Monday 29 June 2026 (about 5 weeks ago), on the page "Day 28".',
    );
  });
});

describe("quietFor", () => {
  const entry = (d: Day): Entry => ({
    frontmatter: {
      date: d.date,
      volume: 1,
      issue: 1,
      headline: d.pages[0]!.headline,
      tags: d.tags,
      people: d.people,
      events: [],
      sessions: [],
      pages: d.pages.map((p) => ({ ...p, sessions: [] })),
      version: 1,
      created: `${d.date}T21:00:00+10:00`,
      updated: `${d.date}T21:00:00+10:00`,
    },
    markdown: `# ${d.pages[0]!.headline}\n`,
  });

  test("reads entries from disk and notices new ones", async () => {
    for (const d of diary(45, (i) => [i % 7 === 0 && i <= 14 ? ["John"] : [], []])) await entries.writeEntry(entry(d));
    const today = addDays(START, 45);
    expect((await quietFor(today)).map((q) => q.name)).toEqual(["John"]);

    await entries.writeEntry(entry(day(44, ["John"])));
    expect(await quietFor(today)).toEqual([]);
  });
});
