/**
 * Going to print: a chat -> Story (the Copy Desk agent) -> a page of the day's entry.
 * Called by POST /api/print. Two steps so small local models stay reliable:
 * the model only has to fill in JSON, and the layout is plain code (pages.ts).
 *
 * - Nothing printed today yet: the chat becomes page 1, the front page.
 * - This chat is already a page: that page is rewritten, the rest are left alone.
 * - Otherwise: a new page is added at the end, from this chat plus any earlier
 *   chats from today that never made it onto a page.
 */
import type { Entry, Session } from "@daily-you/shared";
import { getAgent } from "../agents/_engine/registry";
import { eventsFor, hasCalendars } from "../calendar/feeds";
import { promptContext, runStructured } from "../agents/_engine/run";
import { config } from "../config";
import type { Story } from "../schemas/story";
import { readEntry, writeEntry } from "../store/entries";
import { sessionsForDate, setDropped } from "../store/sessions";
import { buildEntry, formatPages, formatTranscripts, pagesOf, storyToPage } from "./pages";

const hasUserMessage = (s: Session) => s.messages.some((m) => m.role === "user" && m.agent !== "copydesk");

export class NothingToPrintError extends Error {}

function printTask(printed: string, transcripts: string): string {
  if (!printed) {
    return `Task: write the front page of today's paper from the transcript(s) below.\n\nTranscript:\n${transcripts}`;
  }
  return `Task: today's paper already has the page(s) below. Write ONE new page from the new transcript(s) after them.
Only cover what's new in the new transcript(s): don't repeat stories that are already printed. mood is for the part of the day in the new transcript(s).

Already printed:
${printed}

New transcript(s):
${transcripts}`;
}

/** Print the chat `sessionId` onto its day's entry. Returns the entry and which page was written (from 1). */
export async function printSession(date: string, sessionId: string): Promise<{ entry: Entry; page: number }> {
  const existing = await readEntry(date);
  const pages = existing ? pagesOf(existing) : [];
  const all = (await sessionsForDate(date)).filter(hasUserMessage);

  let index = pages.findIndex((p) => p.meta.sessions.includes(sessionId));
  let sessions: Session[];
  if (index >= 0) {
    sessions = all.filter((s) => pages[index]!.meta.sessions.includes(s.id));
  } else {
    // Printing a chat on purpose brings it back even if its page was deleted before.
    const onAPage = new Set(pages.flatMap((p) => p.meta.sessions));
    sessions = all.filter((s) => !onAPage.has(s.id) && (!s.dropped || s.id === sessionId));
    index = pages.length;
  }
  if (!sessions.length) throw new NothingToPrintError("Nothing to print yet: chat about your day first");

  const others = pages.filter((_, i) => i !== index);
  const story = await runStructured<Story>(
    getAgent("copydesk"),
    printTask(others.length ? formatPages(others) : "", formatTranscripts(sessions)),
    promptContext(date),
  );

  const ids = sessions.map((s) => s.id);
  pages[index] = storyToPage(story, ids);
  const entry = await buildEntry(date, pages, existing, config.models.copydesk);
  // The day's events go in the frontmatter. If a calendar can't be read, keep what was saved before.
  if (hasCalendars()) {
    const { events, failed } = await eventsFor(date).catch(() => ({ events: [], failed: ["all"] }));
    if (!failed.length) entry.frontmatter.events = events;
  }
  await writeEntry(entry);
  await setDropped(ids.filter((id) => all.find((s) => s.id === id)?.dropped), false);
  return { entry, page: index + 1 };
}
