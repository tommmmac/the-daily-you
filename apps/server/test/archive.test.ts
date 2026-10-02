import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Thread } from "@daily-you/shared";
import type { ArchiveNotes } from "../src/schemas/archive";
import type { Story } from "../src/schemas/story";

// The model is faked: each call returns the next queued reply, and its input is kept.
const replies: unknown[] = [];
const inputs: string[] = [];
mock.module("../src/llm/ollama", () => ({
  LLMUnavailableError: class extends Error {},
  listModels: async () => [],
  embed: async (_model: string, texts: string[]) => texts.map(() => [1, 0, 0]),
  chatStream: async function* () {},
  chat: async ({ messages }: { messages: { content: string }[] }) => {
    inputs.push(messages.at(-1)!.content);
    if (!replies.length) throw new Error("test ran out of fake replies");
    return { role: "assistant", content: JSON.stringify(replies.shift()) };
  },
}));

const dataDir = await mkdtemp(join(tmpdir(), "daily-you-archive-"));
process.env.DATA_DIR = dataDir;
const { applyFactOps, applyThreadNotes, archivePage } = await import("../src/newsroom/archive");
const { printSession } = await import("../src/newsroom/print");
const memory = await import("../src/store/memory");
const threads = await import("../src/store/threads");
const sessions = await import("../src/store/sessions");
const { chatContext } = await import("../src/agents/_engine/run");

afterAll(() => rm(dataDir, { recursive: true, force: true }));
beforeEach(() => {
  process.env.DATA_DIR = dataDir;
  replies.length = 0;
  inputs.length = 0;
});

const facts = `## Me
<!-- e.g. a hint -->
- Works at a cafe on weekends

## People
- Priya: friend from uni
`;
const add = (section: string, text: string) => ({ op: "add" as const, section, text, old: "" });

describe("applyFactOps", () => {
  test("adds to the end of the right section, or makes the section", () => {
    const { text, changes } = applyFactOps(facts, [add("me", "Works at a bar on Thursdays"), add("Places", "Lives in Carlton")]);
    expect(text).toBe(`## Me
<!-- e.g. a hint -->
- Works at a cafe on weekends
- Works at a bar on Thursdays

## People
- Priya: friend from uni

## Places
- Lives in Carlton
`);
    expect(changes).toEqual(["Added: Works at a bar on Thursdays", "Added: Lives in Carlton"]);
  });

  test("updates and removes by the exact old line, ignoring bullets, case and full stops", () => {
    const { text, changes } = applyFactOps(facts, [
      { op: "update", section: "People", text: "Priya: friend from uni, works at Atlassian", old: "- priya: Friend from uni." },
      { op: "remove", section: "Me", text: "", old: "Works at a cafe on weekends" },
    ]);
    expect(text).toContain("- Priya: friend from uni, works at Atlassian\n");
    expect(text).not.toContain("cafe");
    expect(changes).toEqual([
      "Updated: Priya: friend from uni, works at Atlassian (was: Priya: friend from uni)",
      "Removed: Works at a cafe on weekends",
    ]);
  });

  test("skips duplicates and edits to lines that aren't there", () => {
    const { text, changes } = applyFactOps(facts, [
      add("Me", "works at a cafe on weekends."),
      { op: "remove", section: "Me", text: "", old: "Works at a bank" },
      { op: "update", section: "Me", text: "Works at a pub", old: "" },
    ]);
    expect(text).toBe(facts);
    expect(changes).toEqual([]);
  });
});

describe("applyThreadNotes", () => {
  const open: Thread = { id: "t1", text: "COMP3000 exam (Fri 9 Oct)", due: "2026-10-10", tone: "light", from: "2026-10-05", status: "open" };
  let n = 0;
  const ids = () => `n${++n}`;

  test("a dated thread is asked about the day after, with the date in its text", () => {
    const result = applyThreadNotes([], { threads_resolved: [], threads_new: [{ text: "Canva interview", when: "2026-10-06", tone: "light" }] }, "2026-10-02", ids);
    expect(result.threads[0]).toMatchObject({ text: "Canva interview (Tue 6 Oct)", due: "2026-10-07", from: "2026-10-02" });
  });

  test("an undated thread is asked about a few days later", () => {
    const result = applyThreadNotes([], { threads_resolved: [], threads_new: [{ text: "waiting to hear back", when: "", tone: "tender" }] }, "2026-10-02", ids);
    expect(result.threads[0]).toMatchObject({ text: "waiting to hear back", due: "2026-10-06", tone: "tender" });
  });

  test("resolves by id, skips repeats of open threads and things already over", () => {
    const result = applyThreadNotes(
      [open, { ...open, id: "t2", text: "rolled ankle" }],
      {
        threads_resolved: ["t1", "nope"],
        threads_new: [
          { text: "Rolled ankle.", when: "", tone: "light" },
          { text: "old thing", when: "2026-10-01", tone: "light" },
        ],
      },
      "2026-10-11",
      ids,
    );
    expect(result.resolved).toEqual(["COMP3000 exam (Fri 9 Oct)"]);
    expect(result.added).toEqual([]);
    expect(result.threads.map((t) => [t.id, t.status])).toEqual([
      ["t1", "resolved"],
      ["t2", "open"],
    ]);
  });

  test("isLive: open and not more than two weeks past due", () => {
    expect(threads.isLive(open, "2026-10-24")).toBe(true);
    expect(threads.isLive(open, "2026-10-25")).toBe(false);
    expect(threads.isLive({ ...open, status: "dismissed" }, "2026-10-11")).toBe(false);
  });
});

describe("archivePage", () => {
  const date = "2026-10-08";
  const story: Story = {
    headline: "Exam Looms",
    subhead: "",
    lede: "Exam soon.",
    sections: [],
    pull_quote: "",
    mood: 5,
    tags: [],
    people: [],
  };
  const notes: ArchiveNotes = {
    facts: [add("Me", "Works at a bar on Thursdays")],
    threads_new: [{ text: "COMP3000 exam", when: "2026-10-09", tone: "light" }],
    threads_resolved: [],
  };

  test("learns facts and threads from the printed chat, logs it, and the Reporter sees them when due", async () => {
    const s = await sessions.createSession(date);
    await sessions.addMessage(s, { role: "user", content: "did a bar shift, exam on friday" });
    replies.push(story);
    const { page } = await printSession(date, s.id);

    replies.push(notes);
    const log = await archivePage(date, page);
    expect(inputs.at(-1)).toContain("DIARIST: did a bar shift, exam on friday");
    expect(inputs.at(-1)).toContain("- Fri 2026-10-09: tomorrow, this coming Friday");
    expect(log).toMatchObject({ date, facts: ["Added: Works at a bar on Thursdays"], threadsAdded: ["COMP3000 exam (Fri 9 Oct)"], undo: null });
    expect(await memory.readMemoryLog()).toEqual([log!]);
    expect(await memory.readMemory()).toContain("- Works at a bar on Thursdays");

    // Not due yet on the 9th, due on the 10th.
    expect((await chatContext("2026-10-09")).threads).toBe("Nothing right now.");
    const ctx = await chatContext("2026-10-10");
    expect(ctx.threads).toBe("- COMP3000 exam (Fri 9 Oct) (came up Thursday 2026-10-08)");
    expect(ctx.facts).toContain("Works at a bar on Thursdays");
  });

  test("nothing new means no log entry", async () => {
    const s = await sessions.createSession("2026-10-09");
    await sessions.addMessage(s, { role: "user", content: "quiet day" });
    replies.push(story);
    const { page } = await printSession("2026-10-09", s.id);
    replies.push({ facts: [], threads_new: [], threads_resolved: [] });
    expect(await archivePage("2026-10-09", page)).toBeNull();
    expect((await memory.readMemoryLog()).length).toBe(1);
  });
});
