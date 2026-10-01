/**
 * After a print, the Archivist updates the paper's memory: lasting facts go into
 * data/memory.md and things to follow up on go into data/threads.json.
 * The model only returns JSON (schemas/archive.ts); this file applies it, so a bad
 * answer can't mangle the facts file, and every change is logged and undoable.
 *
 * Runs in the background (queueArchive) so printing doesn't get slower.
 */
import type { MemoryLogEntry, Session, Thread } from "@daily-you/shared";
import { getAgent } from "../agents/_engine/registry";
import { promptContext, runStructured } from "../agents/_engine/run";
import type { ArchiveNotes } from "../schemas/archive";
import { addDays, isoLocal, weekdayOf } from "../store/dates";
import { readEntry } from "../store/entries";
import { factsForPrompt, logMemoryChange, readMemory, writeMemory } from "../store/memory";
import { getSession } from "../store/sessions";
import { isLive, readThreads, writeThreads } from "../store/threads";
import { formatTranscripts } from "./pages";

/** For comparing lines: no bullet, case, extra spaces or trailing full stop. */
const normalize = (line: string) =>
  line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .toLowerCase();

/**
 * Apply fact edits to the facts file text. Edits that point at a line that isn't there
 * (the model misquoted it, or you changed it by hand) are skipped, and adds that are
 * already in the file are skipped too. Returns the new text and what changed, in words.
 */
export function applyFactOps(text: string, ops: ArchiveNotes["facts"]): { text: string; changes: string[] } {
  const lines = text.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const changes: string[] = [];
  const find = (line: string) => (normalize(line) ? lines.findIndex((l) => normalize(l) === normalize(line)) : -1);

  for (const op of ops) {
    const fact = op.text.trim().replace(/^[-*]\s+/, "");
    if (op.op === "add") {
      if (!fact || find(fact) >= 0) continue;
      const heading = lines.findIndex((l) => /^#+\s/.test(l) && normalize(l.replace(/^#+/, "")) === normalize(op.section));
      if (heading < 0) {
        lines.push("", `## ${op.section.trim() || "Notes"}`, `- ${fact}`);
      } else {
        // After the section's last non-blank line, before the next heading.
        let end = lines.findIndex((l, i) => i > heading && /^#+\s/.test(l));
        if (end < 0) end = lines.length;
        while (end > heading + 1 && !lines[end - 1]!.trim()) end--;
        lines.splice(end, 0, `- ${fact}`);
      }
      changes.push(`Added: ${fact}`);
    } else {
      const at = find(op.old);
      if (at < 0) continue;
      const was = lines[at]!.trim().replace(/^[-*]\s+/, "");
      if (op.op === "remove") {
        lines.splice(at, 1);
        changes.push(`Removed: ${was}`);
      } else if (fact && normalize(fact) !== normalize(was)) {
        lines[at] = `- ${fact}`;
        changes.push(`Updated: ${fact} (was: ${was})`);
      }
    }
  }
  return { text: lines.join("\n") + "\n", changes };
}

// With no particular day ("waiting to hear back"), ask about it this many days later.
const UNDATED_DAYS = 4;

/** e.g. "Tue 6 Oct" */
function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${weekdayOf(date).slice(0, 3)} ${d.getDate()} ${d.toLocaleDateString("en-AU", { month: "short" })}`;
}

/**
 * Apply thread changes. A thread on a particular day is asked about the day after,
 * and gets the date in its text ("COMP3000 exam (Tue 6 Oct)") so it still reads right later.
 * New threads that are already open, or already over, are skipped.
 */
export function applyThreadNotes(
  threads: Thread[],
  notes: Pick<ArchiveNotes, "threads_new" | "threads_resolved">,
  date: string,
  newId: () => string = () => crypto.randomUUID().slice(0, 8),
): { threads: Thread[]; added: string[]; resolved: string[] } {
  const next = threads.map((t) => ({ ...t }));
  const resolved: string[] = [];
  for (const id of notes.threads_resolved) {
    const t = next.find((t) => t.id === id && t.status === "open");
    if (!t) continue;
    t.status = "resolved";
    resolved.push(t.text);
  }
  const added: string[] = [];
  for (const n of notes.threads_new) {
    if (n.when && n.when < date) continue;
    const text = n.when ? `${n.text.trim()} (${dayLabel(n.when)})` : n.text.trim();
    if (next.some((t) => t.status === "open" && normalize(t.text) === normalize(text))) continue;
    const due = n.when ? addDays(n.when, 1) : addDays(date, UNDATED_DAYS);
    next.push({ id: newId(), text, due, tone: n.tone, from: date, status: "open" });
    added.push(text);
  }
  return { threads: next, added, resolved };
}

/** Today and the next two weeks, so the model doesn't have to work out what date "Friday" is. */
// Labelled the way people talk, since "next Tuesday" is otherwise a coin flip.
function calendar(date: string): string {
  return Array.from({ length: 15 }, (_, i) => {
    const d = addDays(date, i);
    const day = weekdayOf(d);
    const label =
      i === 0 ? "today" : i === 1 ? `tomorrow, this coming ${day}` : i <= 7 ? `this coming ${day}` : `the ${day} after that`;
    return `- ${day.slice(0, 3)} ${d}: ${label}`;
  }).join("\n");
}

export function archiveTask(date: string, facts: string, open: Thread[], transcripts: string): string {
  const threads = open.length ? open.map((t) => `- [${t.id}] ${t.text}`).join("\n") : "None.";
  return `Calendar:
${calendar(date)}

Facts file now:
${facts || "(empty)"}

Open threads:
${threads}

The chat that was just printed:
${transcripts}`;
}

/**
 * Update memory from the page `page` (from 1) of `date`'s entry.
 * Returns what changed, or null if nothing did.
 */
export async function archivePage(date: string, page: number): Promise<MemoryLogEntry | null> {
  const entry = await readEntry(date);
  const ids = entry?.frontmatter.pages[page - 1]?.sessions ?? [];
  const sessions = (await Promise.all(ids.map((id) => getSession(id)))).filter((s): s is Session => !!s);
  if (!sessions.length) return null;

  const memory = await readMemory();
  const all = await readThreads();
  const open = all.filter((t) => isLive(t, date));
  const notes = await runStructured<ArchiveNotes>(
    getAgent("archivist"),
    archiveTask(date, factsForPrompt(memory), open, formatTranscripts(sessions)),
    promptContext(date),
  );

  const facts = applyFactOps(memory, notes.facts);
  const undo = facts.changes.length ? await writeMemory(facts.text) : null;
  const threads = applyThreadNotes(all, notes, date);
  if (threads.added.length || threads.resolved.length) await writeThreads(threads.threads);

  if (!facts.changes.length && !threads.added.length && !threads.resolved.length) return null;
  const log: MemoryLogEntry = {
    at: isoLocal(),
    date,
    facts: facts.changes,
    threadsAdded: threads.added,
    threadsResolved: threads.resolved,
    undo,
  };
  await logMemoryChange(log);
  return log;
}

// One at a time, so two quick prints can't both rewrite memory.md from the same starting point.
let queue: Promise<unknown> = Promise.resolve();

/** Archive in the background after a print. Failures are logged and otherwise ignored. */
export function queueArchive(date: string, page: number): Promise<MemoryLogEntry | null> {
  const run = queue
    .then(() => archivePage(date, page))
    .catch((e) => {
      console.error(`archiving ${date} page ${page} failed:`, e);
      return null;
    });
  queue = run;
  return run;
}
