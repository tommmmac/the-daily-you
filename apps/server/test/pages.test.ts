import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { joinPages, splitPages } from "@daily-you/shared";
import type { Story } from "../src/schemas/story";

// The Copy Desk's model is faked: each call returns the next story queued in `replies`,
// and the input it was sent is kept in `inputs`.
const replies: Story[] = [];
const inputs: string[] = [];
mock.module("../src/llm/ollama", () => ({
  LLMUnavailableError: class extends Error {},
  listModels: async () => [],
  chatStream: async function* () {},
  chat: async ({ messages }: { messages: { content: string }[] }) => {
    inputs.push(messages.at(-1)!.content);
    const story = replies.shift();
    if (!story) throw new Error("test ran out of fake stories");
    return { role: "assistant", content: JSON.stringify(story) };
  },
}));

const dataDir = await mkdtemp(join(tmpdir(), "daily-you-pages-"));
process.env.DATA_DIR = dataDir;
const { readEntry, writeEntry, restoreVersion } = await import("../src/store/entries");
const sessions = await import("../src/store/sessions");
const { printSession } = await import("../src/newsroom/print");
const { editPage, deletePage, deleteDay } = await import("../src/newsroom/edit");
const { pagesOf } = await import("../src/newsroom/pages");

afterAll(() => rm(dataDir, { recursive: true, force: true }));
beforeEach(() => {
  process.env.DATA_DIR = dataDir;
  replies.length = 0;
  inputs.length = 0;
});

const story = (headline: string, mood: number, tags: string[] = []): Story => ({
  headline,
  subhead: `${headline} subhead`,
  lede: `${headline} lede.`,
  sections: [{ heading: "Details", body: `${headline} body.` }],
  pull_quote: "",
  mood,
  tags,
  people: [],
});

async function chatAbout(date: string, text: string) {
  const s = await sessions.createSession(date);
  await sessions.addMessage(s, { role: "user", content: text });
  return s;
}

describe("splitPages / joinPages", () => {
  test("round-trip, numbering markers in order", () => {
    const body = joinPages(["# A\n\nx", "# B", "# C"]);
    expect(body).toContain("<!-- page 2 -->\n\n---\n\n# B");
    expect(body).toContain("<!-- page 3 -->");
    expect(splitPages(body)).toEqual(["# A\n\nx", "# B", "# C"]);
  });

  test("a plain body is one page, and a --- rule on its own isn't a page break", () => {
    expect(splitPages("# Only\n\ntext\n\n---\n\nmore\n")).toEqual(["# Only\n\ntext\n\n---\n\nmore"]);
  });
});

describe("printing pages", () => {
  const date = "2026-10-01";

  test("first chat is the front page, a second chat adds page 2 without touching page 1", async () => {
    const a = await chatAbout(date, "fixed my bike");
    replies.push(story("Bike Fixed", 4, ["cycling"]));
    expect((await printSession(date, a.id)).page).toBe(1);
    expect(inputs[0]).toContain("front page");
    const page1 = splitPages((await readEntry(date))!.markdown)[0];

    const b = await chatAbout(date, "went to the pub");
    replies.push(story("Pub Visited", 8, ["pub", "cycling"]));
    expect((await printSession(date, b.id)).page).toBe(2);
    expect(inputs[1]).toContain("Already printed");
    expect(inputs[1]).toContain("Bike Fixed");

    const entry = (await readEntry(date))!;
    const pages = splitPages(entry.markdown);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toBe(page1!);
    expect(entry.frontmatter.headline).toBe("Bike Fixed");
    expect(entry.frontmatter.mood).toBe(6); // average of 4 and 8
    expect(entry.frontmatter.tags).toEqual(["cycling", "pub"]);
    expect(entry.frontmatter.sessions).toEqual([a.id, b.id]);
  });

  test("printing the same chat again rewrites only its page", async () => {
    const b = (await readEntry(date))!.frontmatter.pages[1]!.sessions[0]!;
    replies.push(story("Pub Visited, Again", 6));
    expect((await printSession(date, b)).page).toBe(2);
    const entry = (await readEntry(date))!;
    expect(entry.frontmatter.pages.map((p) => p.headline)).toEqual(["Bike Fixed", "Pub Visited, Again"]);
  });

  test("editing a page changes only that page, and undo brings the old one back", async () => {
    const before = (await readEntry(date))!;
    replies.push(story("Bike Heroically Fixed", 4, ["cycling"]));
    const result = await editPage(date, 1, "make the headline more dramatic");
    expect(inputs[0]).toContain("make the headline more dramatic");
    expect(inputs[0]).toContain("fixed my bike"); // the page's transcript, for reference

    const after = (await readEntry(date))!;
    expect(after.frontmatter.headline).toBe("Bike Heroically Fixed");
    expect(splitPages(after.markdown)[1]).toBe(splitPages(before.markdown)[1]!);
    expect(result.undo).toBe(before.frontmatter.version);

    await restoreVersion(date, result.undo);
    expect((await readEntry(date))!.frontmatter.headline).toBe("Bike Fixed");
  });

  test("a deleted page's chat doesn't come back on the next page printed", async () => {
    const dropped = (await readEntry(date))!.frontmatter.pages[1]!.sessions[0]!;
    await deletePage(date, 2);
    expect(pagesOf((await readEntry(date))!)).toHaveLength(1);
    expect((await sessions.getSession(dropped))?.dropped).toBe(true);

    const c = await chatAbout(date, "cooked dinner");
    replies.push(story("Dinner Cooked", 7));
    await printSession(date, c.id);
    expect(inputs[0]).toContain("cooked dinner");
    expect(inputs[0]).not.toContain("went to the pub");
    expect((await readEntry(date))!.frontmatter.pages[1]!.sessions).toEqual([c.id]);
  });

  test("deleting the last page, or the whole day, removes the entry; undo restores it", async () => {
    const result = await deleteDay(date);
    expect(result?.deleted).toBe(true);
    expect(await readEntry(date)).toBeNull();
    await restoreVersion(date, result!.undo);
    expect(pagesOf((await readEntry(date))!)).toHaveLength(2);

    await deletePage(date, 2);
    const last = await deletePage(date, 1);
    expect(last.deleted).toBe(true);
    expect(await readEntry(date)).toBeNull();
    await expect(deletePage(date, 1)).rejects.toThrow("No entry");
  });
});

describe("entries from before pages existed", () => {
  test("the whole body is page 1, and a new chat adds page 2", async () => {
    const date = "2026-10-02";
    await writeEntry({
      frontmatter: {
        date,
        volume: 1,
        issue: 1,
        headline: "Old Style Entry",
        mood: 5,
        tags: ["old"],
        people: [],
        events: [],
        sessions: ["2026-10-02-oldoldol"],
        pages: [],
        version: 1,
        created: "2026-10-02T21:00:00+10:00",
        updated: "2026-10-02T21:00:00+10:00",
      },
      markdown: "# Old Style Entry\n\nBody.\n",
    });
    const pages = pagesOf((await readEntry(date))!);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.meta.headline).toBe("Old Style Entry");

    const s = await chatAbout(date, "later that night");
    replies.push(story("Night Falls", 7));
    expect((await printSession(date, s.id)).page).toBe(2);
    const entry = (await readEntry(date))!;
    expect(entry.frontmatter.headline).toBe("Old Style Entry");
    expect(entry.frontmatter.mood).toBe(6);
  });
});
