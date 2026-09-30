/**
 * Every tool an agent can use, by name. Agents list the ones they want in
 * manifest.yaml (`tools: [recall]`), and the loader fails at startup on unknown names.
 *
 * To add a tool: write it in its own file here and add it to TOOLS below.
 */
import type { ToolSchema } from "../llm/ollama";

export type Tool = {
  /** Shown to the model: what it does and what arguments it takes. */
  schema: ToolSchema;
  run: (args: any) => unknown | Promise<unknown>;
};

export const TOOLS: Record<string, Tool> = {
  // recall: Phase 3 (The Morgue)
  // todays_events: Phase 4 (calendar)
};
