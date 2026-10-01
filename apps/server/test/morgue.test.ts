import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Entry } from "@daily-you/shared";

// A fake embedding: counts of a few words, so pages about the same thing land close together.
const VOCAB = ["climb", "ankle", "bouldering", "exam", "comp3000", "priya", "coffee", "bar", "shift"];
const embedded: string[] = [];
const fakeEmbed = (text: string) => [0.1, ...VOCAB.map((w) => text.toLowerCase().split(w).length - 1)];
const picks: unknown[] = [];
const pickInputs: string[] = [];
mock.module("../src/llm/ollama", () => ({
  LLMUnavailableError: class extends Error {},
  listModels: async () => [],
  chatStream: async function* () {},
  embed: async (_model: string, texts: string[]) => {
    embedded.push(...texts);
    return texts.map(fakeEmbed);
  },
  chat: async ({ messages }: { messages: { content: string }[] }) => {
    pickInputs.push(messages.at(-1)!.content);
    return { role: "assistant", content: JSON.stringify(picks.shift() ?? { pick: 0, why: "" }) };
  },
}));

const dataDir = await mkdtemp(join(tmpdir(), "daily-you-morgue-"));
process.env.DATA_DIR = dataDir;
const entries = await import("../src/store/entries");
const sessions = await import("../src/store/sessions");
const morgue = await import("../src/morgue");
const recall = await import("../src/morgue/recall");
const { chatContext } = await import("../src/agents/_engine/run");

afterAll(async () => {
  morgue.closeIndex();
  await rm(dataDir, { recursive: true, force: true });
});
beforeEach(() => {
  process.env.DATA_DIR = dataDir;
  embedded.length = 0;
  picks.length = 0;
  pickInputs.length = 0;
});

/** An entry with one page per [headline, body]. */
function entry(date: string, pages: [string, string][], version = 1): Entry {
  return {
    frontmatter: {
      date,
      volume: 1,
      issue: 1,
      headline: pages[0]![0],
      tags: [],
      people: [],
      events: [],
      sessions: [],
      pages: pages.map(([headline]) => ({ headline, tags: [], people: [], sessions: [] })),
      version,
      created: "2026-09-01T21:00:00+10:00",
      updated: "2026-09-01T21:00:00+10:00",
    },
    markdown: pages.map(([h, body], i) => `${i ? `<!-- page ${i + 1} -->\n\n---\n\n` : ""}# ${h}\n\n${body}`).join("\n\n"),
  };
}

describe("onEntryChange", () => {
  test("hears about writes, deletes and restores", async () => {
    const heard: string[] = [];
    const stop = entries.onEntryChange((d) => heard.push(d));
    await entries.writeEntry(entry("2026-08-01", [["A", "a"]]));
    await entries.deleteEntry("2026-08-01");
    await entries.restoreVersion("2026-08-01", 1);
    await entries.deleteEntry("1999-01-01"); // nothing there, nothing heard
    stop();
    await entries.writeEntry(entry("2026-08-02", [["B", "b"]]));
    expect(heard).toEqual(["2026-08-01", "2026-08-01", "2026-08-01"]);
    await entries.deleteEntry("2026-08-01");
    await entries.deleteEntry("2026-08-02");
  });
});

describe("index", () => {
  test("embeds each page with its date and headline in front", async () => {
    await entries.writeEntry(entry("2026-09-10", [["Ankle Down", "Rolled my ankle bouldering."], ["Coffee", "Coffee with Priya."]]));
    expect(await morgue.syncDate("2026-09-10")).toBe(true);
    expect(embedded).toEqual([
      "search_document: Thursday 10 September 2026 (2026-09-10). Ankle Down.\n\n# Ankle Down\n\nRolled my ankle bouldering.",
      "search_document: Thursday 10 September 2026 (2026-09-10). Coffee.\n\n# Coffee\n\nCoffee with Priya.",
    ]);
  });

  test("only re-embeds when the entry changes, and forgets deleted days", async () => {
    expect(await morgue.syncDate("2026-09-10")).toBe(false);
    await entries.writeEntry(entry("2026-09-10", [["Ankle Down", "Rolled my ankle bouldering, it's huge."]], 2));
    expect(await morgue.syncDate("2026-09-10")).toBe(true);
    expect((await morgue.search("ankle", { before: "2026-12-31" })).length).toBe(1);

    await entries.deleteEntry("2026-09-10");
    expect(await morgue.syncAll()).toBe(1);
    expect(await morgue.search("ankle", { before: "2026-12-31" })).toEqual([]);
  });

  test("search ranks by meaning and only looks at earlier days", async () => {
    await entries.writeEntry(entry("2026-09-10", [["Ankle Down", "Rolled my ankle bouldering."]]));
    await entries.writeEntry(entry("2026-09-12", [["Exam Stress", "COMP3000 exam on Friday."]]));
    await entries.writeEntry(entry("2026-09-20", [["Back On The Wall", "Went to climb again, ankle fine."]]));
    expect(await morgue.syncAll()).toBe(3);

    const hits = await morgue.search("going bouldering, hope the ankle holds", { before: "2026-09-20" });
    expect(hits.map((h) => h.date)).toEqual(["2026-09-10", "2026-09-12"]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });
});

describe("recall", () => {
  async function chatting(date: string, ...said: string[]) {
    const s = await sessions.createSession(date);
    for (const content of said) await sessions.addMessage(s, { role: "user", content });
    return s;
  }

  test("picks a past page for the next turn, once per chat", async () => {
    const s = await chatting("2026-09-25", "heading bouldering tonight");
    picks.push({ pick: 1, why: "They rolled their ankle bouldering last time." });
    const picked = await recall.recallFor(s, "heading bouldering tonight");
    expect(picked).toMatchObject({ date: "2026-09-10", headline: "Ankle Down" });
    expect(pickInputs[0]).toContain("[0] Nothing here is worth bringing up.");
    expect(pickInputs[0]).toContain('[1] Thursday 10 September 2026, "Ankle Down" (one-off): # Ankle Down Rolled my ankle bouldering.');

    const ctx = await chatContext("2026-09-25", s.id);
    expect(ctx.recalled).toBe(
      "From their diary on Thursday 10 September 2026 (about 2 weeks ago):\n# Ankle Down\n\nRolled my ankle bouldering.\n(Why it came to mind: They rolled their ankle bouldering last time.)",
    );
    // Taken once, and no more picks in this chat.
    expect((await chatContext("2026-09-25", s.id)).recalled).toBe("Nothing right now.");
    expect(await recall.recallFor(s, "the ankle was fine actually")).toBeNull();
    expect(pickInputs.length).toBe(1);
  });

  test("no pick, or a tiny message, means nothing (and it can try again later)", async () => {
    const s = await chatting("2026-09-25", "had a quiet one at home");
    expect(await recall.recallFor(s, "had a quiet one at home")).toBeNull();
    expect(await recall.recallFor(s, "yeah")).toBeNull();
    expect(pickInputs.length).toBe(1);

    picks.push({ pick: 99, why: "out of range" });
    expect(await recall.recallFor(s, "might go bouldering tomorrow")).toBeNull();
    expect((await chatContext("2026-09-25", s.id)).recalled).toBe("Nothing right now.");
  });
});

describe("ago", () => {
  test("rough, the way people say it", () => {
    expect(recall.ago("2026-09-30", "2026-10-01")).toBe("yesterday");
    expect(recall.ago("2026-09-27", "2026-10-01")).toBe("4 days ago");
    expect(recall.ago("2026-09-23", "2026-10-01")).toBe("about a week ago");
    expect(recall.ago("2026-09-12", "2026-10-01")).toBe("about 3 weeks ago");
    expect(recall.ago("2026-06-01", "2026-10-01")).toBe("about 4 months ago");
    expect(recall.ago("2024-10-01", "2026-10-01")).toBe("about 2 years ago");
  });
});
