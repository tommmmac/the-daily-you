/**
 * Entries: one Markdown file per day at data/entries/YYYY/MM/YYYY-MM-DD.md,
 * YAML frontmatter + body. See docs/ENTRY_FORMAT.md.
 *
 * Before any overwrite, the old file is copied to data/versions/<date>/v<N>.md.
 */
import { mkdir, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { EntryFrontmatter, type Entry, type EntrySummary } from "@daily-you/shared";
import { config } from "../config";

const entriesDir = () => join(config.dataDir, "entries");

export function entryPath(date: string): string {
  const [y, m] = date.split("-");
  return join(entriesDir(), y!, m!, `${date}.md`);
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseEntry(text: string): Entry {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new Error("entry has no frontmatter");
  const raw = Bun.YAML.parse(match[1]!) as Record<string, unknown>;
  // YAML turns bare dates into Date objects; keep them as strings.
  if (raw.date instanceof Date) raw.date = raw.date.toISOString().slice(0, 10);
  return {
    frontmatter: EntryFrontmatter.parse(raw),
    markdown: text.slice(match[0].length).replace(/^\r?\n/, ""),
  };
}

export function serializeEntry(entry: Entry): string {
  const yaml = Bun.YAML.stringify(entry.frontmatter, null, 2).trimEnd();
  return `---\n${yaml}\n---\n\n${entry.markdown.trimEnd()}\n`;
}

export async function readEntry(date: string): Promise<Entry | null> {
  const file = Bun.file(entryPath(date));
  if (!(await file.exists())) return null;
  return parseEntry(await file.text());
}

/** Write an entry, saving the previous version first if one exists. */
export async function writeEntry(entry: Entry): Promise<void> {
  const path = entryPath(entry.frontmatter.date);
  const existing = await readEntry(entry.frontmatter.date);
  if (existing) {
    const versionsDir = join(config.dataDir, "versions", entry.frontmatter.date);
    await mkdir(versionsDir, { recursive: true });
    await copyFile(path, join(versionsDir, `v${existing.frontmatter.version}.md`));
  }
  await Bun.write(path, serializeEntry(entry));
}

/** Every entry date on disk, newest first. */
export async function listEntryDates(): Promise<string[]> {
  let files: string[];
  try {
    files = await readdir(entriesDir(), { recursive: true });
  } catch {
    return [];
  }
  return files
    .map((f) => /(\d{4}-\d{2}-\d{2})\.md$/.exec(f)?.[1])
    .filter((d): d is string => !!d)
    .sort()
    .reverse();
}

export async function listEntries(opts: { from?: string; to?: string } = {}): Promise<EntrySummary[]> {
  const dates = (await listEntryDates()).filter(
    (d) => (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to),
  );
  const summaries: EntrySummary[] = [];
  for (const date of dates) {
    try {
      const { frontmatter: f } = (await readEntry(date))!;
      summaries.push({ date: f.date, issue: f.issue, headline: f.headline, mood: f.mood, tags: f.tags });
    } catch (e) {
      console.warn(`Skipping unreadable entry ${date}:`, e);
    }
  }
  return summaries;
}

/**
 * Issue and volume numbers for a date. An existing entry keeps its numbers;
 * a new one is the next issue. Volume 1 is the year of the first entry.
 */
export async function issueNumbers(date: string): Promise<{ issue: number; volume: number }> {
  const dates = await listEntryDates();
  const firstYear = Number((dates.at(-1) ?? date).slice(0, 4));
  const volume = Number(date.slice(0, 4)) - Math.min(firstYear, Number(date.slice(0, 4))) + 1;
  const existing = await readEntry(date).catch(() => null);
  if (existing) return { issue: existing.frontmatter.issue, volume };
  return { issue: dates.length + 1, volume };
}
