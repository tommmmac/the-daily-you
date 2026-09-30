import { z } from "zod";
import type { Msg, Session } from "@daily-you/shared";
import { config } from "../../config";
import { chat as llmChat, chatStream, type OllamaMessage } from "../../llm/ollama";
import { weekdayOf } from "../../store/dates";
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

export function promptContext(date: string): PromptContext {
  return {
    date,
    weekday: weekdayOf(date),
    time: new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }),
    name: config.userName || "the diarist",
  };
}

/**
 * Run one turn through a single agent's prompt, tools and history, streaming the reply.
 * Tool calls (if the agent has tools) are resolved first, then the final reply streams.
 */
export async function* runAgent(agent: Agent, history: Msg[], ctx: PromptContext): AsyncGenerator<string> {
  const model = config.models[agent.model];
  const messages: OllamaMessage[] = [{ role: "system", content: agent.systemPrompt(ctx) }, ...history];
  const tools = Object.values(agent.tools);

  if (tools.length) {
    const first = await llmChat({ model, messages, tools: tools.map((t) => t.schema) });
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

  yield* chatStream({ model, messages });
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

export type ChatStreamEvent = { type: "route"; agent: string } | { type: "token"; text: string };

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

  const history = toHistory(session);
  if (message) {
    await addMessage(session, { role: "user", content: message });
    history.push({ role: "user", content: message });
  } else {
    history.push({ role: "user", content: OPENER });
  }

  let reply = "";
  for await (const text of runAgent(agent, history, promptContext(session.date))) {
    reply += text;
    yield { type: "token", text };
  }
  await addMessage(session, { role: "assistant", content: reply }, agent.name);
}
