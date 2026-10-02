import { z } from "zod";
import type { Session } from "@daily-you/shared";
import { config } from "../../config";
import { chat as llmChat, chatStream, type OllamaMessage } from "../../llm/ollama";
import { weekdayOf } from "../../store/dates";
import { factsForPrompt, readMemory } from "../../store/memory";
import { formatQuiet, quietFor } from "../../morgue/patterns";
import { formatRecalled, takeRecall } from "../../morgue/recall";
import { dueThreads } from "../../store/threads";
import { addMessage, toHistory } from "../../store/sessions";
import { getAgent } from "./registry";
import { route } from "./router";
import type { Agent, PromptContext } from "./types";

// Small local models drift from tool results as history grows, so this goes right
// before the final reply rather than in each agent's prompt.
const GROUNDING_REMINDER =
  "Answer using only the facts in the tool result(s) above. Never invent a name, date or detail that isn't there.";

// Sent (but never saved) when the Reporter should open the interview itself.
const OPENER = "(The diarist has just opened the app. Greet them briefly and ask about their day.)";
const OPENER_WITH_THREADS =
  "(The diarist has just opened the app. Greet them briefly. Ask about ONE of the things to follow up on, or about their day if none of them fit.)";

const NO_THREADS = "Nothing right now.";
// The Reporter only asks about one, so don't crowd its prompt.
const MAX_THREADS = 3;
const MAX_QUIET = 2;

export function promptContext(date: string): PromptContext {
  return {
    date,
    weekday: weekdayOf(date),
    time: new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }),
    name: config.userName || "the diarist",
    language: config.language,
    pronouns: config.pronouns || "not set, so keep it gender-neutral (they/them)",
    facts: "",
    threads: "",
    recalled: "",
    quiet: "",
  };
}

/**
 * promptContext plus what the chat agents remember about the diarist. With a session id,
 * it also takes the past page recalled for that chat, if one is waiting (see morgue/recall.ts).
 * A failure to work out patterns just leaves them out: they're never worth failing a chat over.
 */
export async function chatContext(date: string, sessionId?: string): Promise<PromptContext> {
  const facts = factsForPrompt(await readMemory());
  const threads = (await dueThreads(date))
    .slice(0, MAX_THREADS)
    .map((t) => `- ${t.text} (came up ${weekdayOf(t.from)} ${t.from})${t.tone === "tender" ? " [sensitive: ask gently]" : ""}`)
    .join("\n");
  const recalled = sessionId ? takeRecall(sessionId) : undefined;
  const quiet = await quietFor(date).catch((e) => {
    console.warn("patterns failed:", e);
    return [];
  });
  return {
    ...promptContext(date),
    facts: facts || "Nothing yet.",
    threads: threads || NO_THREADS,
    recalled: recalled ? formatRecalled(recalled, date) : "Nothing right now.",
    quiet: formatQuiet(quiet.slice(0, MAX_QUIET), date) || "Nothing right now.",
  };
}

/**
 * Run one turn through a single agent's prompt, tools and history, streaming the reply.
 * Tool calls (if the agent has tools) are resolved first, then the final reply streams.
 */
export async function* runAgent(
  agent: Agent,
  history: OllamaMessage[],
  ctx: PromptContext,
  temperature?: number,
): AsyncGenerator<string> {
  const model = config.models[agent.model];
  const messages: OllamaMessage[] = [{ role: "system", content: agent.systemPrompt(ctx) }, ...history];
  const tools = Object.values(agent.tools);

  if (tools.length) {
    const first = await llmChat({ model, messages, tools: tools.map((t) => t.schema), temperature });
    if (!first.tool_calls?.length) {
      yield first.content;
      return;
    }
    messages.push(first);
    for (const call of first.tool_calls) {
      const tool = agent.tools[call.function.name];
      const result = tool ? await tool.run(call.function.arguments) : `Unknown tool ${call.function.name}`;
      messages.push({ role: "tool", content: typeof result === "string" ? result : JSON.stringify(result) });
    }
    messages.push({ role: "system", content: GROUNDING_REMINDER });
  }

  yield* chatStream({ model, messages, temperature });
}

export class BadOutputError extends Error {}

/**
 * Run an agent that has an `output:` schema: the model is constrained to that JSON schema,
 * and the reply is validated with zod. Retries once before giving up.
 */
export async function runStructured<T>(agent: Agent, input: string, ctx: PromptContext): Promise<T> {
  if (!agent.output) throw new Error(`agent '${agent.name}' has no output schema`);
  const messages: OllamaMessage[] = [
    { role: "system", content: agent.systemPrompt(ctx) },
    { role: "user", content: input },
  ];
  const format = z.toJSONSchema(agent.output) as Record<string, unknown>;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await llmChat({ model: config.models[agent.model], messages, format, temperature: 0.7 });
    try {
      return agent.output.parse(JSON.parse(reply.content)) as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw new BadOutputError(`The ${agent.name} agent didn't return valid output`, { cause: lastError });
}

export type ChatStreamEvent =
  | { type: "route"; agent: string }
  | { type: "token"; text: string }
  /** Drop the tokens so far: the reply is being written again (see offScript). */
  | { type: "reset" };

// Qwen now and then slides into Chinese mid-reply (docs/FINDINGS.md, 2026-10-02), and once one
// character is out the rest follows. If that happens, the reply is thrown away and written
// again, cooler, which makes long-shot words less likely. The last try is kept whatever it says.
const RETRIES = 2;
const RETRY_TEMPERATURE = 0.3;
const CJK = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;
const CJK_LANGUAGE = /chinese|mandarin|cantonese|japanese|korean|中文|汉语|漢語|日本語|한국어/i;

/** True if `text` has Chinese, Japanese or Korean characters but the paper's language isn't one of those. */
export function offScript(text: string, language: string): boolean {
  return CJK.test(text) && !CJK_LANGUAGE.test(language);
}

/**
 * The one entry point for a conversational turn. Routes the message (or uses `agentName`
 * when a button picked it), runs the agent, and saves both turns to the session.
 * With no message, the default agent opens the conversation.
 */
export async function* chat(
  session: Session,
  message: string | undefined,
  agentName?: string,
): AsyncGenerator<ChatStreamEvent> {
  const name = agentName ?? (message ? await route(message) : "reporter");
  const agent = getAgent(name);
  yield { type: "route", agent: agent.name };

  const ctx = await chatContext(session.date, session.id);
  const history = toHistory(session, agent.name);
  if (message) {
    await addMessage(session, { role: "user", content: message });
    history.push({ role: "user", content: message });
  } else {
    history.push({ role: "user", content: ctx.threads === NO_THREADS ? OPENER : OPENER_WITH_THREADS });
  }

  let reply = "";
  for (let attempt = 0; ; attempt++) {
    reply = "";
    let slipped = false;
    for await (const text of runAgent(agent, history, ctx, attempt ? RETRY_TEMPERATURE : undefined)) {
      if (attempt < RETRIES && offScript(text, ctx.language)) {
        slipped = true;
        break;
      }
      reply += text;
      yield { type: "token", text };
    }
    if (!slipped) break;
    console.warn(`The ${agent.name} slipped out of ${ctx.language}, writing the reply again`);
    yield { type: "reset" };
  }
  await addMessage(session, { role: "assistant", content: reply }, agent.name);
}
