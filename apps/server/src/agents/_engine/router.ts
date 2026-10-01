/**
 * The Editor-in-Chief: decides which agent handles a free-text message, and what the
 * diarist seems to want from it (see classifyIntent).
 * Buttons never come through here; they name their agent directly.
 */
import { z } from "zod";
import { config } from "../../config";
import { chat } from "../../llm/ollama";
import { AGENTS, DEFAULT_AGENT } from "./registry";
import type { Agent } from "./types";

function routableAgents(): Agent[] {
  return Object.values(AGENTS).filter((a) => a.routable);
}

export function buildRouterPrompt(agents: Agent[]): string {
  const list = agents.map((a) => `- ${a.name}: ${a.description}`).join("\n");
  return `You are the Editor-in-Chief of a personal newspaper. Decide which desk should handle the diarist's message.

Desks:
${list}

Reply with ONLY the desk name from the list above, nothing else: no punctuation, no explanation.
If nothing fits clearly, reply "${DEFAULT_AGENT}".`;
}

/**
 * Used when the router LLM call fails or answers with something unusable.
 * If exactly one agent's keywords show up in the message, route to it.
 * Zero or several matches is too ambiguous to guess.
 */
export function keywordFallback(message: string, agents: Agent[]): string | null {
  const lowered = message.toLowerCase();
  const matches = agents.filter((a) => a.keywords.some((kw) => lowered.includes(kw)));
  return matches.length === 1 ? matches[0]!.name : null;
}

/** Pick which agent (a key in AGENTS) should handle this message. */
export async function route(message: string): Promise<string> {
  const agents = routableAgents();
  // Nothing to decide: skip the model call entirely.
  if (agents.length <= 1) return agents[0]?.name ?? DEFAULT_AGENT;

  try {
    const reply = await chat({
      model: config.models.router,
      temperature: 0,
      messages: [
        { role: "system", content: buildRouterPrompt(agents) },
        { role: "user", content: message },
      ],
    });
    const choice = reply.content.trim().toLowerCase();
    if (agents.some((a) => a.name === choice)) return choice;
  } catch (e) {
    console.warn("Router LLM call failed, falling back to keywords:", e);
  }
  return keywordFallback(message, agents) ?? DEFAULT_AGENT;
}

/**
 * What a message is asking for. Only ever used to offer a button (newsroom/suggest.ts),
 * never to act: a casual reply once got routed as an edit and rewrote a page
 * (docs/FINDINGS.md, 2026-10-01).
 */
export const Intent = z.object({
  intent: z.enum(["chat", "edit_entry", "print", "recall"]),
  /** For edit_entry: the page they mean, from 1, if they said. */
  page: z.number().int().nullable(),
});
export type Intent = z.infer<typeof Intent>;

const CHAT: Intent = { intent: "chat", page: null };

export type IntentContext = {
  /** The Reporter's last message, so a reply to a question reads as a reply. */
  lastReply?: string;
  /** Headlines of today's printed pages, in order. Empty if nothing's printed yet. */
  headlines: string[];
};

export function buildIntentPrompt({ headlines }: IntentContext): string {
  const paper = headlines.length
    ? `Today's paper so far:\n${headlines.map((h, i) => `- page ${i + 1}: "${h}"`).join("\n")}`
    : "Nothing has been printed today yet.";
  return `You are the Editor-in-Chief of a personal newspaper. The diarist is chatting with the Reporter about their day. Decide what their latest message is asking for.

${paper}

Intents:
- chat: talking about their day, answering the Reporter, or anything else. This is almost always right.
- edit_entry: clearly asking to change something already printed: a page, the headline, the story ("change the headline to...", "page 2 got it wrong, it was Sally"). Only possible if something has been printed.
- print: asking to print or write up the chat now ("print it", "that's everything, write it up").
- recall: asking about a past day ("when did I last see Sam?").

Answering one of the Reporter's questions is always chat, even if it mentions a part of something ("yeah the driving bit"). If unsure, it's chat.

Reply with JSON: {"intent": "<one of the above>", "page": <the page number they mean, or null>}. Only give a page for edit_entry when they name a page or clearly mean one headline.`;
}

/**
 * The Reporter's question and the reply, labelled in one message. Sent as an assistant
 * turn, the model would take the Reporter's words as its own (docs/FINDINGS.md).
 */
export function buildIntentInput(message: string, { lastReply }: IntentContext): string {
  const asked = lastReply ? `The Reporter said: ${lastReply}\n\n` : "";
  return `${asked}The diarist's latest message: ${message}`;
}

/**
 * Work out what a message is asking for. Any failure (Ollama down, junk JSON) counts
 * as chat, since the worst case should be not offering a button.
 */
export async function classifyIntent(message: string, ctx: IntentContext): Promise<Intent> {
  try {
    const reply = await chat({
      model: config.models.router,
      temperature: 0,
      messages: [
        { role: "system", content: buildIntentPrompt(ctx) },
        { role: "user", content: buildIntentInput(message, ctx) },
      ],
      format: z.toJSONSchema(Intent) as Record<string, unknown>,
    });
    const intent = Intent.parse(JSON.parse(reply.content));
    // Nothing printed means nothing to edit, whatever the model thinks.
    return intent.intent === "edit_entry" && !ctx.headlines.length ? CHAT : intent;
  } catch (e) {
    console.warn("Intent check failed, treating it as chat:", e);
    return CHAT;
  }
}
