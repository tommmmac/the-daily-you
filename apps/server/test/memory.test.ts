import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "daily-you-memory-"));
process.env.DATA_DIR = dataDir;
const memory = await import("../src/store/memory");

afterAll(() => rm(dataDir, { recursive: true, force: true }));

describe("facts file", () => {
  test("starts as the template, with nothing for the Reporter yet", async () => {
    expect(await memory.readMemory()).toBe(memory.MEMORY_TEMPLATE);
    expect(memory.factsForPrompt(memory.MEMORY_TEMPLATE)).toBe("");
  });

  test("first save has nothing to undo, later saves keep the old one", async () => {
    expect(await memory.writeMemory("## Me\n- Works at a bar")).toBeNull();
    expect(await memory.writeMemory("## Me\n- Works at a bar and a cafe")).toBe(1);
    expect(await memory.writeMemory("## Me\n- Quit the cafe")).toBe(2);
    expect(await memory.readMemory()).toBe("## Me\n- Quit the cafe\n");
  });

  test("restore brings an old version back and can itself be undone", async () => {
    const restored = await memory.restoreMemory(2);
    expect(restored).toEqual({ text: "## Me\n- Works at a bar and a cafe\n", undo: 3 });
    expect(await memory.readMemory()).toBe("## Me\n- Works at a bar and a cafe\n");
    expect(await memory.restoreMemory(99)).toBeNull();
  });
});

describe("factsForPrompt", () => {
  test("drops hint comments and empty sections", () => {
    const text = `## Me
<!-- e.g. - a hint -->
- Works at a bar on Thursdays

## People
<!-- e.g. - Priya -->

## Places

## Ongoing
- Training for a 10k
`;
    expect(memory.factsForPrompt(text)).toBe("## Me\n- Works at a bar on Thursdays\n\n## Ongoing\n- Training for a 10k");
  });

  test("keeps notes written without any headings", () => {
    expect(memory.factsForPrompt("- Studies at Monash")).toBe("- Studies at Monash");
  });
});
