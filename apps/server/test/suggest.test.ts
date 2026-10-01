import { describe, expect, test } from "bun:test";
import { buildIntentInput, buildIntentPrompt } from "../src/agents/_engine/router";
import type { Page } from "../src/newsroom/pages";
import { pickPage, toSuggestion } from "../src/newsroom/suggest";

const page = (headline: string, sessions: string[] = []): Page => ({
  meta: { headline, tags: [], people: [], sessions },
  markdown: `# ${headline}`,
});
const pages = [page("Front", ["s1"]), page("Second", ["s2"]), page("Third")];
const opts = { date: "2026-10-01", pages, sessionId: "s2", message: "change the headline" };

describe("pickPage", () => {
  test("uses the page they named if it exists", () => {
    expect(pickPage(1, pages, "s2")).toBe(1);
  });

  test("otherwise the page printed from this chat, else the newest", () => {
    expect(pickPage(null, pages, "s2")).toBe(2);
    expect(pickPage(9, pages, "s2")).toBe(2);
    expect(pickPage(null, pages, "other")).toBe(3);
  });
});

describe("toSuggestion", () => {
  test("print offers the print button", () => {
    expect(toSuggestion({ intent: "print", page: null }, opts)).toEqual({ action: "print" });
  });

  test("edit offers an Edit button prefilled with the message", () => {
    expect(toSuggestion({ intent: "edit_entry", page: 3 }, opts)).toEqual({
      action: "edit",
      date: "2026-10-01",
      page: 3,
      headline: "Third",
      instruction: "change the headline",
    });
  });

  test("chat and recall offer nothing, and nothing printed means no edit", () => {
    expect(toSuggestion({ intent: "chat", page: null }, opts)).toBeNull();
    expect(toSuggestion({ intent: "recall", page: null }, opts)).toBeNull();
    expect(toSuggestion({ intent: "edit_entry", page: 1 }, { ...opts, pages: [] })).toBeNull();
  });
});

describe("intent prompt", () => {
  test("lists today's pages", () => {
    const prompt = buildIntentPrompt({ headlines: ["Front", "Second"] });
    expect(prompt).toContain('- page 1: "Front"');
    expect(prompt).toContain('- page 2: "Second"');
    expect(buildIntentPrompt({ headlines: [] })).toContain("Nothing has been printed today yet.");
  });

  test("labels the Reporter's question instead of sending it as the model's own turn", () => {
    expect(buildIntentInput("yeah the driving bit", { lastReply: "What was funny?", headlines: [] })).toBe(
      "The Reporter said: What was funny?\n\nThe diarist's latest message: yeah the driving bit",
    );
    expect(buildIntentInput("hi", { headlines: [] })).toBe("The diarist's latest message: hi");
  });
});
