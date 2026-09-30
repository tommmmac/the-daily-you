/**
 * Discovers agents from src/agents/<name>/ folders.
 *
 * Each agent folder holds:
 *   manifest.yaml  name, description (shown to the router), enabled, routable, model,
 *                  tools (names from src/tools), output (a name from src/schemas),
 *                  triggers.keywords.
 *   agent.md       the system prompt, a template with {{placeholders}}.
 *   README.md      a few sentences for humans. Not read by the loader.
 *
 * Agents are pure config, no code. See agents/README.md for the full contract.
 */
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config, type ModelRole } from "../../config";
import { OUTPUTS } from "../../schemas";
import { TOOLS, type Tool } from "../../tools";
import type { Agent, PromptContext } from "./types";

const AGENTS_DIR = resolve(import.meta.dir, "..");

export class AgentLoadError extends Error {
  constructor(folder: string, reason: string) {
    super(`agent folder '${folder}': ${reason}`);
  }
}

export type Manifest = {
  name?: string;
  description?: string;
  enabled?: boolean;
  routable?: boolean;
  model?: string;
  tools?: string[];
  output?: string;
  triggers?: { keywords?: string[] };
};

/** Replace {{key}} with ctx[key]. Unknown keys are left as-is. */
export function renderPrompt(template: string, ctx: PromptContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in ctx ? String(ctx[key as keyof PromptContext]) : match,
  );
}

/** Build an Agent from a parsed manifest and prompt template, checking every reference. */
export function buildAgent(folder: string, manifest: Manifest, template: string): Agent {
  const fail = (reason: string) => new AgentLoadError(folder, reason);
  if (!manifest.name) throw fail("manifest.yaml is missing required field 'name'");
  if (manifest.name !== folder) throw fail(`name '${manifest.name}' must match the folder name`);
  if (!manifest.description) throw fail("manifest.yaml is missing required field 'description'");

  const model = (manifest.model ?? manifest.name) as ModelRole;
  if (!(model in config.models)) {
    throw fail(`model '${model}' isn't a model setting (${Object.keys(config.models).join(", ")})`);
  }

  const tools: Record<string, Tool> = {};
  for (const name of manifest.tools ?? []) {
    const tool = TOOLS[name];
    if (!tool) throw fail(`unknown tool '${name}' (available: ${Object.keys(TOOLS).join(", ") || "none yet"})`);
    tools[name] = tool;
  }

  const output = manifest.output ? OUTPUTS[manifest.output] : undefined;
  if (manifest.output && !output) {
    throw fail(`unknown output '${manifest.output}' (available: ${Object.keys(OUTPUTS).join(", ")})`);
  }

  return {
    name: manifest.name,
    description: manifest.description.trim(),
    routable: manifest.routable ?? true,
    model,
    systemPrompt: (ctx) => renderPrompt(template, ctx),
    tools,
    output,
    keywords: (manifest.triggers?.keywords ?? []).map((k) => String(k).toLowerCase()),
  };
}

/** Scan every subfolder of src/agents/ that has a manifest.yaml and build an Agent from it. */
export async function discoverAgents(): Promise<Record<string, Agent>> {
  const agents: Record<string, Agent> = {};
  const entries = await readdir(AGENTS_DIR, { withFileTypes: true });

  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join(AGENTS_DIR, entry.name);
    const manifestFile = Bun.file(join(dir, "manifest.yaml"));
    if (!(await manifestFile.exists())) continue; // not an agent folder, e.g. _engine

    const manifest = (Bun.YAML.parse(await manifestFile.text()) ?? {}) as Manifest;
    if (manifest.enabled === false) continue;

    const promptFile = Bun.file(join(dir, "agent.md"));
    if (!(await promptFile.exists())) throw new AgentLoadError(entry.name, "missing agent.md (the system prompt)");

    const agent = buildAgent(entry.name, manifest, await promptFile.text());
    agents[agent.name] = agent;
  }
  return agents;
}
