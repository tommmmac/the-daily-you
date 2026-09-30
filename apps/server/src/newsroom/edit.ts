/**
 * Changing a printed entry: edit one page with the Copy Desk, or delete a page or a
 * whole entry. Every change saves the old file to versions/ first, so it can be undone.
 * Called from the entry page's buttons (routes/entries.ts), never from chat.
 */
import type { ChangeResult, Session } from "@daily-you/shared";
import { getAgent } from "../agents/_engine/registry";
import { promptContext, runStructured } from "../agents/_engine/run";
import { config } from "../config";
import type { Story } from "../schemas/story";
import { deleteEntry, readEntry, writeEntry } from "../store/entries";
import { getSession, setDropped } from "../store/sessions";
import { buildEntry, formatTranscripts, pagesOf, storyToPage } from "./pages";

export class NoSuchPageError extends Error {}

function editTask(page: number, markdown: string, instruction: string, transcripts: string): string {
  const reference = transcripts ? `\n\nTranscript(s) this page was written from, for reference:\n${transcripts}` : "";
  return `Task: the diarist wants a change to page ${page} of today's paper. Return the whole page with the change made.
Keep everything else the same unless the instruction says otherwise. The instruction is the diarist's own words, so facts in it can be used.

Instruction: ${instruction}

Current page:
${markdown}${reference}`;
}

async function load(date: string, page: number) {
  const entry = await readEntry(date);
  if (!entry) throw new NoSuchPageError(`No entry for ${date}`);
  const pages = pagesOf(entry);
  if (!Number.isInteger(page) || page < 1 || page > pages.length) {
    throw new NoSuchPageError(`${date} has no page ${page}`);
  }
  return { entry, pages };
}

/** Rewrite one page (from 1) following the diarist's instruction. */
export async function editPage(date: string, page: number, instruction: string): Promise<ChangeResult> {
  const { entry, pages } = await load(date, page);
  const target = pages[page - 1]!;
  const sessions = (await Promise.all(target.meta.sessions.map(getSession))).filter((s): s is Session => !!s);

  const story = await runStructured<Story>(
    getAgent("copydesk"),
    editTask(page, target.markdown, instruction, sessions.length ? formatTranscripts(sessions) : ""),
    promptContext(date),
  );
  pages[page - 1] = storyToPage(story, target.meta.sessions);
  const updated = await buildEntry(date, pages, entry, config.models.copydesk);
  await writeEntry(updated);
  return { date, page, headline: story.headline, deleted: false, undo: entry.frontmatter.version };
}

/**
 * Delete one page (from 1). Its chats are marked dropped so they don't end up on the
 * next page printed that day. Deleting the only page deletes the entry.
 */
export async function deletePage(date: string, page: number): Promise<ChangeResult> {
  const { entry, pages } = await load(date, page);
  const [removed] = pages.splice(page - 1, 1);
  await setDropped(removed!.meta.sessions, true);

  if (!pages.length) {
    await deleteEntry(date);
    return { date, page, deleted: true, undo: entry.frontmatter.version };
  }
  await writeEntry(await buildEntry(date, pages, entry));
  return { date, page, deleted: false, undo: entry.frontmatter.version };
}

/** Delete a whole day's entry. Returns null if there wasn't one. */
export async function deleteDay(date: string): Promise<ChangeResult | null> {
  const entry = await readEntry(date);
  if (!entry) return null;
  await setDropped(pagesOf(entry).flatMap((p) => p.meta.sessions), true);
  await deleteEntry(date);
  return { date, page: 0, deleted: true, undo: entry.frontmatter.version };
}
