/**
 * Every agent the newsroom can route to, discovered from src/agents/<name>/ folders.
 *
 * To add an agent: add a folder under src/agents/ (see README.md for the
 * manifest.yaml / agent.md / README.md contract). Nothing here needs to change.
 */
import { discoverAgents } from "./loader";

export const AGENTS = await discoverAgents();

/** Where anything unclear goes. The Reporter just keeps the interview going. */
export const DEFAULT_AGENT = "reporter";

if (!(DEFAULT_AGENT in AGENTS)) {
  throw new Error(`default agent '${DEFAULT_AGENT}' not found. Discovered agents: ${Object.keys(AGENTS).join(", ")}`);
}

export function getAgent(name: string) {
  return AGENTS[name] ?? AGENTS[DEFAULT_AGENT]!;
}
