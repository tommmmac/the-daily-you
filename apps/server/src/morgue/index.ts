/**
 * The Morgue's index: one row per printed page, with an embedding of its text, in
 * data/morgue.sqlite. It's only a cache of data/entries/, so deleting the file is safe:
 * syncAll() rebuilds it (and runs at startup).
 *
 * Vectors are compared in plain JS. A few hundred pages a year is a few milliseconds,
 * so there's no need for a vector extension.
 */
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { config } from "../config";
import { embed } from "../llm/ollama";
import { pagesOf } from "../newsroom/pages";
import { weekdayOf } from "../store/dates";
import { listEntryDates, readEntry } from "../store/entries";

let db: Database | null = null;
let dbPath = "";

// Opened lazily, and reopened if the data folder changes (tests point it at temp folders).
function open(): Database {
  const path = join(config.dataDir, "morgue.sqlite");
  if (db && dbPath === path) return db;
  db?.close();
  db = new Database(path, { create: true });
  dbPath = path;
  db.run(`create table if not exists chunks (
    date text not null,
    page integer not null,
    version integer not null,
    model text not null,
    headline text not null,
    text text not null,
    vec blob not null,
    primary key (date, page)
  )`);
  return db;
}

/** Close the database (Windows won't delete an open file, which matters for tests). */
export function closeIndex() {
  db?.close();
  db = null;
  dbPath = "";
}

// nomic-embed-text wants to be told whether it's embedding a document or a query.
const docPrefix = (model: string) => (/nomic/i.test(model) ? "search_document: " : "");
const queryPrefix = (model: string) => (/nomic/i.test(model) ? "search_query: " : "");

/** e.g. "Thursday 1 October 2026" */
export function longDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${weekdayOf(date)} ${d.getDate()} ${d.toLocaleDateString("en-AU", { month: "long" })} ${d.getFullYear()}`;
}

/**
 * What gets embedded for a page. The date and headline go first: in testing that
 * took the right page from 14/24 to 19/24 at #1, because a chunk alone loses who and when.
 */
export function chunkText(date: string, headline: string, markdown: string): string {
  return `${longDate(date)} (${date}). ${headline}.\n\n${markdown}`;
}

function toBlob(vec: number[]): Uint8Array {
  const norm = Math.hypot(...vec) || 1;
  return new Uint8Array(Float32Array.from(vec, (x) => x / norm).buffer);
}
const fromBlob = (blob: Uint8Array) => new Float32Array(new Uint8Array(blob).buffer);

/**
 * Bring one day's rows up to date with its entry: re-embed if the entry's version or the
 * embedding model changed, remove the rows if the entry is gone. Returns true if it changed anything.
 */
export async function syncDate(date: string): Promise<boolean> {
  const d = open();
  const entry = await readEntry(date).catch(() => null);
  if (!entry) return d.run("delete from chunks where date = ?", [date]).changes > 0;

  const model = config.models.embed;
  const pages = pagesOf(entry);
  const rows = d.query("select version, model from chunks where date = ?").all(date) as { version: number; model: string }[];
  const fresh =
    rows.length === pages.length && rows.every((r) => r.version === entry.frontmatter.version && r.model === model);
  if (fresh) return false;

  const texts = pages.map((p) => chunkText(date, p.meta.headline, p.markdown));
  const vecs = await embed(model, texts.map((t) => docPrefix(model) + t));
  d.transaction(() => {
    d.run("delete from chunks where date = ?", [date]);
    pages.forEach((p, i) =>
      d.run("insert into chunks (date, page, version, model, headline, text, vec) values (?, ?, ?, ?, ?, ?, ?)", [
        date,
        i + 1,
        entry.frontmatter.version,
        model,
        p.meta.headline,
        texts[i]!,
        toBlob(vecs[i]!),
      ]),
    );
  })();
  return true;
}

/** Sync every entry, and drop rows for days that no longer exist. Returns how many days changed. */
export async function syncAll(): Promise<number> {
  const dates = await listEntryDates();
  let changed = 0;
  for (const date of dates) if (await syncDate(date)) changed++;
  const known = new Set(dates);
  const indexed = open().query("select distinct date from chunks").all() as { date: string }[];
  for (const { date } of indexed) if (!known.has(date)) changed += Number(await syncDate(date));
  return changed;
}

// One sync at a time, so a quick print-then-undo can't interleave.
let queue: Promise<unknown> = Promise.resolve();

/** Sync one day (or everything, with no date) in the background. Failures are logged. */
export function queueSync(date?: string): Promise<void> {
  const run = queue
    .then(async () => {
      if (date) await syncDate(date);
      else await syncAll();
    })
    .catch(
      (e) => console.error(`Morgue: couldn't index ${date ?? "entries"} (is ${config.models.embed} pulled in Ollama?):`, e),
    );
  queue = run;
  return run;
}

export type Hit = {
  date: string;
  page: number;
  headline: string;
  text: string;
  score: number;
  /** How many other days are near-identical to this one: high for routine days, 0 for one-offs. */
  similar: number;
};

// Above this, two pages are basically the same kind of day. In the recall eval every
// one-off day had 0 others above it, and routine days had at least 5.
const SIMILAR = 0.85;

// Vectors are stored normalised, so the dot product is the cosine similarity.
function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

// How many of the closest pages MMR chooses from.
const POOL = 100;
/** Default trade-off between relevance and variety, from 0 (relevance only) to 1. */
export const DIVERSITY = 0.3;

/**
 * The `k` pages closest in meaning to `query`, from days before `before`.
 *
 * A diary has lots of near-identical days (another gym session, another coffee), and they
 * can fill every slot and push out the one day that matters. So results are picked with
 * MMR (maximal marginal relevance): each next page is the one that's most relevant
 * minus how much it repeats a page already picked. `diversity` sets how much repeats count.
 */
export async function search(query: string, opts: { before: string; k?: number; diversity?: number }): Promise<Hit[]> {
  const model = config.models.embed;
  const rows = open()
    .query("select date, page, headline, text, vec from chunks where model = ? and date < ?")
    .all(model, opts.before) as (Omit<Hit, "score" | "similar"> & { vec: Uint8Array })[];
  if (!rows.length) return [];
  const [raw] = await embed(model, [queryPrefix(model) + query]);
  const q = fromBlob(toBlob(raw!));

  const pool = rows
    .map(({ vec, ...row }) => {
      const v = fromBlob(vec);
      return { ...row, v, score: dot(q, v) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, POOL);

  const diversity = opts.diversity ?? DIVERSITY;
  const picked: typeof pool = [];
  while (picked.length < (opts.k ?? 20) && pool.length) {
    let best = 0;
    let bestValue = -Infinity;
    pool.forEach((c, i) => {
      const repeats = picked.length ? Math.max(...picked.map((p) => dot(p.v, c.v))) : 0;
      const value = (1 - diversity) * c.score - diversity * repeats;
      if (value > bestValue) [best, bestValue] = [i, value];
    });
    picked.push(pool.splice(best, 1)[0]!);
  }
  const all = rows.map((r) => fromBlob(r.vec));
  return picked.map(({ v, ...hit }) => ({ ...hit, similar: all.filter((other) => dot(v, other) > SIMILAR).length - 1 }));
}
