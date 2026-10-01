import type { z } from "zod";
import type { ModelRole } from "../../config";
import type { Tool } from "../../tools";

/** Values available to agent.md as {{placeholders}}. */
export type PromptContext = {
  date: string; // diary day, YYYY-MM-DD
  weekday: string;
  time: string;
  name: string; // the diarist's name, may be ""
  /** What the facts file (data/memory.md) says about them. Only filled in for chat turns. */
  facts: string;
  /** Open threads that are due, one per line. Only filled in for chat turns. */
  threads: string;
};

/**
 * A single newsroom desk, built by loader.ts from an agent folder (manifest.yaml + agent.md).
 * Agents are pure config: tools come from src/tools/, output schemas from src/schemas/.
 */
export type Agent = {
  name: string; // folder name, also what the router answers with
  description: string; // shown to the router so it knows when to pick this agent
  /** Whether free-text chat can be routed here. Agents only reached from code set this false. */
  routable: boolean;
  /** Which model setting to use (config.models[role]). */
  model: ModelRole;
  systemPrompt: (ctx: PromptContext) => string;
  tools: Record<string, Tool>;
  /** If set, the agent replies with JSON matching this schema (see runStructured). */
  output?: z.ZodType;
  keywords: string[]; // router fallback if the LLM call fails or answers junk
};
