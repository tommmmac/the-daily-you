/**
 * The Editor-in-Chief: decides which agent handles a free-text message.
 * Buttons never come through here; they name their agent directly.
 */
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
