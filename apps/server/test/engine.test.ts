import { describe, expect, test } from "bun:test";
import { buildAgent, discoverAgents, renderPrompt } from "../src/agents/_engine/loader";
import { buildRouterPrompt, keywordFallback } from "../src/agents/_engine/router";
import type { Agent } from "../src/agents/_engine/types";

const ctx = { date: "2026-09-30", weekday: "Wednesday", time: "9:00 pm", name: "Tom", language: "English", pronouns: "he/him", facts: "", threads: "", recalled: "", quiet: "", events: "" };

describe("renderPrompt", () => {
  test("fills known placeholders and leaves unknown ones", () => {
    expect(renderPrompt("Hi {{name}}, it's {{weekday}} {{date}}. {{nope}}", ctx)).toBe(
      "Hi Tom, it's Wednesday 2026-09-30. {{nope}}",
    );
  });

  test("leaves single-brace JSON alone", () => {
    expect(renderPrompt('{"mood": 7}', ctx)).toBe('{"mood": 7}');
  });
});

describe("discoverAgents", () => {
  test("finds the reporter and copy desk from their folders", async () => {
    const agents = await discoverAgents();
    expect(Object.keys(agents)).toEqual(expect.arrayContaining(["reporter", "copydesk"]));
    expect(agents.reporter!.routable).toBe(true);
    expect(agents.copydesk!.routable).toBe(false);
    expect(agents.copydesk!.output).toBeDefined();
    expect(agents.reporter!.systemPrompt(ctx)).toContain("Wednesday 2026-09-30");
  });
});

describe("buildAgent", () => {
  const ok = { name: "desk", description: "A desk", model: "reporter" };

  test("builds a pure-config agent", () => {
    const a = buildAgent("desk", { ...ok, output: "story" }, "Hi {{name}}");
    expect(a.routable).toBe(true);
    expect(a.output).toBeDefined();
    expect(a.systemPrompt(ctx)).toBe("Hi Tom");
  });

  test("fails loudly on bad references", () => {
    expect(() => buildAgent("desk", { ...ok, tools: ["nope"] }, "")).toThrow("unknown tool 'nope'");
    expect(() => buildAgent("desk", { ...ok, output: "nope" }, "")).toThrow("unknown output 'nope'");
    expect(() => buildAgent("desk", { ...ok, model: "nope" }, "")).toThrow("isn't a model setting");
    expect(() => buildAgent("other", ok, "")).toThrow("must match the folder name");
    expect(() => buildAgent("desk", { name: "desk" }, "")).toThrow("description");
  });
});

describe("router", () => {
  const agent = (name: string, keywords: string[]): Agent => ({
    name,
    description: `${name} desk`,
    routable: true,
    model: "reporter",
    systemPrompt: () => "",
    tools: {},
    keywords,
  });
  const agents = [agent("reporter", []), agent("morgue", ["remember", "last time"]), agent("copydesk", ["headline"])];

  test("keyword fallback picks the single matching agent", () => {
    expect(keywordFallback("when was the last time I saw John?", agents)).toBe("morgue");
  });

  test("keyword fallback gives up when several or none match", () => {
    expect(keywordFallback("remember that headline?", agents)).toBeNull();
    expect(keywordFallback("had a good day", agents)).toBeNull();
  });

  test("router prompt lists every desk", () => {
    const prompt = buildRouterPrompt(agents);
    for (const a of agents) expect(prompt).toContain(`- ${a.name}: ${a.name} desk`);
  });
});
