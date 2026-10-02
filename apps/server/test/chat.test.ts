import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Reporter's model is faked: each call streams the next queued reply, token by token,
// and the temperature it was called with is kept.
const replies: string[][] = [];
const temperatures: (number | undefined)[] = [];
mock.module("../src/llm/ollama", () => ({
  LLMUnavailableError: class extends Error {},
  listModels: async () => [],
  embed: async (_model: string, texts: string[]) => texts.map(() => [1, 0, 0]),
  chat: async () => ({ role: "assistant", content: "{}" }),
  chatStream: async function* ({ temperature }: { temperature?: number }) {
    temperatures.push(temperature);
    yield* replies.shift() ?? [];
  },
}));

const dataDir = await mkdtemp(join(tmpdir(), "daily-you-chat-"));
process.env.DATA_DIR = dataDir;
const { chat, offScript } = await import("../src/agents/_engine/run");
const sessions = await import("../src/store/sessions");

afterAll(() => rm(dataDir, { recursive: true, force: true }));
beforeEach(() => {
  process.env.DATA_DIR = dataDir;
  replies.length = 0;
  temperatures.length = 0;
});

async function run(message: string) {
  const session = await sessions.createSession("2026-10-02");
  const events = [];
  for await (const ev of chat(session, message)) events.push(ev);
  return { events, saved: (await sessions.getSession(session.id))!.messages.at(-1)!.content };
}

describe("offScript", () => {
  test("Chinese, Japanese or Korean characters, unless that's the paper's language", () => {
    expect(offScript("Have you俩", "English")).toBe(true);
    expect(offScript("こんにちは", "Spanish")).toBe(true);
    expect(offScript("Have you two been before?", "English")).toBe(false);
    expect(offScript("你们俩", "Chinese")).toBe(false);
    expect(offScript("你们俩", "中文")).toBe(false);
    expect(offScript("¿Qué tal?", "Spanish")).toBe(false);
  });
});

describe("chat", () => {
  test("a reply that slips into Chinese is thrown away and written again, cooler", async () => {
    replies.push(["Cool, have ", "you俩之前", "去过吗"], ["Cool, have you two ", "been before?"]);
    const { events, saved } = await run("yeah keen, john is coming too");
    expect(events.map((e) => (e.type === "token" ? e.text : e.type))).toEqual([
      "route",
      "Cool, have ",
      "reset",
      "Cool, have you two ",
      "been before?",
    ]);
    expect(temperatures).toEqual([undefined, 0.3]);
    expect(saved).toBe("Cool, have you two been before?");
  });

  test("gives up after two retries and keeps the last try", async () => {
    replies.push(["你好"], ["你好"], ["你好"]);
    const { events, saved } = await run("hi there");
    expect(events.filter((e) => e.type === "reset").length).toBe(2);
    expect(saved).toBe("你好");
  });

  test("a normal reply streams once", async () => {
    replies.push(["How was ", "your day?"]);
    const { events } = await run("hey");
    expect(events.map((e) => e.type)).toEqual(["route", "token", "token"]);
    expect(temperatures).toEqual([undefined]);
  });
});
