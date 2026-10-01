/**
 * After each chat message, the Editor-in-Chief checks whether the diarist seems to want
 * to print or edit, and if so offers a button. It never prints or edits by itself:
 * chat always goes to the Reporter, and the diarist clicks to confirm.
 */
import type { Session, Suggestion } from "@daily-you/shared";
import { classifyIntent, type Intent } from "../agents/_engine/router";
import { readEntry } from "../store/entries";
import { pagesOf, type Page } from "./pages";

/**
 * Which page an edit most likely means: the one they named, else the page printed from
 * this chat, else the newest page.
 */
export function pickPage(named: number | null, pages: Page[], sessionId: string): number {
  if (named && named >= 1 && named <= pages.length) return named;
  const own = pages.findIndex((p) => p.meta.sessions.includes(sessionId));
  return own >= 0 ? own + 1 : pages.length;
}

export function toSuggestion(
  intent: Intent,
  opts: { date: string; pages: Page[]; sessionId: string; message: string },
): Suggestion | null {
  if (intent.intent === "print") return { action: "print" };
  if (intent.intent === "edit_entry" && opts.pages.length) {
    const page = pickPage(intent.page, opts.pages, opts.sessionId);
    return {
      action: "edit",
      date: opts.date,
      page,
      headline: opts.pages[page - 1]!.meta.headline,
      instruction: opts.message,
    };
  }
  // recall has nowhere to go until The Morgue (Phase 3).
  return null;
}

/**
 * What to offer after `message`. Call it before the message is added to the session,
 * so the Reporter's last reply is the one being answered.
 */
export async function suggest(session: Session, message: string): Promise<Suggestion | null> {
  const lastReply = session.messages.filter((m) => m.role === "assistant").at(-1)?.content;
  const entry = await readEntry(session.date);
  const pages = entry ? pagesOf(entry) : [];
  const intent = await classifyIntent(message, { lastReply, headlines: pages.map((p) => p.meta.headline) });
  return toSuggestion(intent, { date: session.date, pages, sessionId: session.id, message });
}
