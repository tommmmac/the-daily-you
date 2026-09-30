/**
 * Entries: one Markdown file per day at data/entries/YYYY/MM/YYYY-MM-DD.md,
 * YAML frontmatter + body. See docs/ENTRY_FORMAT.md.
 *
 * Before any overwrite, the old file is copied to data/versions/<date>/v<N>.md.
 */
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { EntryFrontmatter, type Entry, type EntrySummary, type VersionSummary } from "@daily-you/shared";
import { config } from "../config";

const entriesDir = () => join(config.dataDir, "entries");
const versionsDir = (date: string) => join(config.dataDir, "versions", date);

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

/** Copy the current file for a date into versions/, if there is one. */
async function saveVersion(date: string): Promise<Entry | null> {
  const existing = await readEntry(date);
  if (existing) {
    await mkdir(versionsDir(date), { recursive: true });
    await copyFile(entryPath(date), join(versionsDir(date), `v${existing.frontmatter.version}.md`));
  }
  return existing;
}

/** Write an entry, saving the previous version first if one exists. */
export async function writeEntry(entry: Entry): Promise<void> {
  await saveVersion(entry.frontmatter.date);
  await Bun.write(entryPath(entry.frontmatter.date), serializeEntry(entry));
}

/** Delete an entry. The file is kept in versions/, so it can be restored. Returns false if there was none. */
export async function deleteEntry(date: string): Promise<boolean> {
  const existing = await saveVersion(date);
  if (existing) await rm(entryPath(date));
  return !!existing;
}

/** Saved old versions of a day's entry, newest first. */
export async function listVersions(date: string): Promise<VersionSummary[]> {
  let files: string[];
  try {
    files = await readdir(versionsDir(date));
  } catch {
    return [];
  }
  const versions: VersionSummary[] = [];
  for (const f of files) {
    const v = /^v(\d+)\.md$/.exec(f)?.[1];
    if (!v) continue;
    const entry = await readVersion(date, Number(v)).catch(() => null);
    if (entry) versions.push({ version: Number(v), updated: entry.frontmatter.updated });
  }
  return versions.sort((a, b) => b.version - a.version);
}

export async function readVersion(date: string, version: number): Promise<Entry | null> {
  const file = Bun.file(join(versionsDir(date), `v${version}.md`));
  if (!(await file.exists())) return null;
  return parseEntry(await file.text());
}

/**
 * Bring back an old version as a new version (so the restore can be undone too).
 * Works after the entry was deleted as well. Returns null if that version doesn't exist.
 */
export async function restoreVersion(date: string, version: number): Promise<Entry | null> {
  const old = await readVersion(date, version);
  if (!old) return null;
  const current = await readEntry(date);
  const latest = Math.max(current?.frontmatter.version ?? 0, ...(await listVersions(date)).map((v) => v.version));
  const entry: Entry = { ...old, frontmatter: { ...old.frontmatter, version: latest + 1 } };
  await writeEntry(entry);
  return entry;
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
