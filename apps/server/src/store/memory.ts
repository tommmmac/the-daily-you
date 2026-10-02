/**
 * The facts file: data/memory.md, what the Reporter knows about you (people, work, places).
 * Plain Markdown you can edit. Before any overwrite, the old file is copied to
 * data/versions/memory/v<N>.md, so every change can be undone.
 */
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MemoryLogEntry } from "@daily-you/shared";
import { config } from "../config";

const memoryPath = () => join(config.dataDir, "memory.md");
const versionsDir = () => join(config.dataDir, "versions", "memory");

// What a new facts file starts as. The comments are hints for you and are hidden from the Reporter.
export const MEMORY_TEMPLATE = `## Me
<!-- e.g. - Works at a bar on Thursday nights and a cafe on weekends -->

## People
<!-- e.g. - Priya: close friend from uni -->

## Places

## Ongoing
<!-- e.g. - Training for a 10k in November -->
`;

export async function readMemory(): Promise<string> {
  const file = Bun.file(memoryPath());
  return (await file.exists()) ? file.text() : MEMORY_TEMPLATE;
}

async function versionNumbers(): Promise<number[]> {
  const files = await readdir(versionsDir()).catch(() => [] as string[]);
  return files.map((f) => Number(/^v(\d+)\.md$/.exec(f)?.[1])).filter((n) => n > 0);
}

/**
 * Write the facts file, saving the old one first.
 * Returns the version the old one was saved as (to undo to), or null if there wasn't one.
 */
export async function writeMemory(text: string): Promise<number | null> {
  let saved: number | null = null;
  if (await Bun.file(memoryPath()).exists()) {
    saved = Math.max(0, ...(await versionNumbers())) + 1;
    await mkdir(versionsDir(), { recursive: true });
    await copyFile(memoryPath(), join(versionsDir(), `v${saved}.md`));
  }
  await Bun.write(memoryPath(), text.trimEnd() + "\n");
  return saved;
}

/** Bring back an old version (saving the current one first, so this can be undone too). */
export async function restoreMemory(version: number): Promise<{ text: string; undo: number | null } | null> {
  const old = Bun.file(join(versionsDir(), `v${version}.md`));
  if (!(await old.exists())) return null;
  const text = await old.text();
  return { text, undo: await writeMemory(text) };
}

/**
 * The facts as the Reporter sees them: hint comments and empty sections removed.
 * Empty string if there's nothing in there yet.
 */
export function factsForPrompt(text: string): string {
  const sections = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/^(?=#+ )/m)
    .map((s) => s.trim().replace(/\n\s*\n/g, "\n"))
    .filter((s) => s && s.split("\n").slice(/^#+ /.test(s) ? 1 : 0).some((l) => l.trim()));
  return sections.join("\n\n");
}

// What the Archivist changed after each print, newest first. Kept short; it's for showing and undoing.
const logPath = () => join(config.dataDir, "memory-log.json");
const LOG_LIMIT = 50;

export async function readMemoryLog(): Promise<MemoryLogEntry[]> {
  const file = Bun.file(logPath());
  if (!(await file.exists())) return [];
  return MemoryLogEntry.array().parse(await file.json());
}

export async function logMemoryChange(entry: MemoryLogEntry): Promise<void> {
  const log = [entry, ...(await readMemoryLog())].slice(0, LOG_LIMIT);
  await Bun.write(logPath(), JSON.stringify(log, null, 2) + "\n");
}
