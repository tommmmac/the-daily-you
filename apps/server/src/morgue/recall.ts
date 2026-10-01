/**
 * Callbacks: while you chat, find a past diary page worth bringing up ("been back
 * climbing since the ankle?") and hand it to the Reporter for its next reply.
 *
 * 1. search(): the 20 past pages closest in meaning to what you've just said.
 * 2. pickCallback(): the router model reads them and picks one a friend would bring up, or none.
 *
 * In testing, vector search alone put the right page first 19/24 times, and letting a
 * model pick from the top 20 got 23/24 (docs/FINDINGS.md, 2026-10-01).
 *
 * Runs after the Reporter's reply (so it doesn't slow it down) and at most once per chat.
 * The pick is kept in memory, not in the session file, so it can't race with saving messages.
 */
import { z } from "zod";
import type { Session } from "@daily-you/shared";
import { config } from "../config";
import { chat } from "../llm/ollama";
import { longDate, search, type Hit } from "./index";

export type Recalled = Hit & { why: string };

// How much of each page the picker sees, and how much the Reporter gets.
const PREVIEW_CHARS = 600;
const RECALLED_CHARS = 1500;
// "yeah", "lol", "not really" aren't worth searching on.
const MIN_WORDS = 3;
// A page with this many near-identical days is labelled routine for the picker.
const ROUTINE = 3;

// "why" comes first so the model says what connects before it commits to a number.
const Pick = z.object({
  why: z.string(),
  /** 1-based index into the candidates, or 0 for none. */
  pick: z.number().int(),
});

export const PICK_PROMPT = `You help the Reporter of a personal diary remember things. The diarist is chatting about today. You get what they just said and some pages from their past diary, numbered.

Decide whether ONE past page is worth bringing up right now, the way a good friend who remembers would.

A page is only worth it if it's about a specific event or situation that connects to what they just said: an injury, news, a fight, a milestone, something they were worried or excited about, how something turned out.
Having done the same activity before is NOT a reason by itself. Something has to have happened on that day that's worth asking about now: they got hurt, got news, had a problem, made a plan, were worried, something changed. A normal session, coffee, shift or study day isn't worth it.
Each page is marked "routine" (there are lots of days like it) or "one-off". Routine pages are almost never worth it. Sharing a topic or a word isn't enough.

Most of the time nothing is worth it, and the answer is 0.

- why: first, the specific thing on that page that connects to what they said, in one sentence. Or "nothing specific" if there isn't one.
- pick: the page number, or 0.

Reply with JSON: {"why": "<sentence>", "pick": <number, or 0>}`;

export function pickInput(today: string, said: string[], candidates: Hit[]): string {
  const pages = candidates
    .map((c, i) => {
      const body = c.text.split("\n").slice(1).join(" ").replace(/\s+/g, " ").trim().slice(0, PREVIEW_CHARS);
      const kind = c.similar >= ROUTINE ? `routine: one of ${c.similar + 1} very similar days` : "one-off";
      return `[${i + 1}] ${longDate(c.date)}, "${c.headline}" (${kind}): ${body}`;
    })
    .join("\n\n");
  return `Today is ${longDate(today)}.\n\nWhat they just said:\n${said.map((s) => `- ${s}`).join("\n")}\n\nPast pages:\n[0] Nothing here is worth bringing up.\n\n${pages}`;
}

/** Ask the router model which candidate (if any) is worth bringing up. Failures count as none. */
export async function pickCallback(today: string, said: string[], candidates: Hit[]): Promise<Recalled | null> {
  if (!candidates.length) return null;
  try {
    const reply = await chat({
      model: config.models.router,
      temperature: 0,
      messages: [
        { role: "system", content: PICK_PROMPT },
        { role: "user", content: pickInput(today, said, candidates) },
      ],
      format: z.toJSONSchema(Pick) as Record<string, unknown>,
    });
    const { pick, why } = Pick.parse(JSON.parse(reply.content));
    const hit = candidates[pick - 1];
    return hit ? { ...hit, why } : null;
  } catch (e) {
    console.warn("Recall pick failed, skipping:", e);
    return null;
  }
}

const pending = new Map<string, Recalled>();
const used = new Set<string>();
const running = new Set<string>();

/**
 * After a chat turn: look for a past page to bring up, and keep it for the next turn.
 * Skipped if this chat already had one, one is already being looked for, or the message is tiny.
 */
export async function recallFor(session: Session, message: string): Promise<Recalled | null> {
  if (used.has(session.id) || running.has(session.id)) return null;
  if (message.trim().split(/\s+/).length < MIN_WORDS) return null;
  running.add(session.id);
  try {
    // The last few things they said, so "yeah it was the same gym" still has its context.
    const said = session.messages.filter((m) => m.role === "user").map((m) => m.content).slice(-3);
    const candidates = await search(said.join("\n"), { before: session.date });
    const picked = await pickCallback(session.date, said, candidates);
    if (picked) {
      pending.set(session.id, picked);
      used.add(session.id);
    }
    return picked;
  } finally {
    running.delete(session.id);
  }
}

/** The page picked for this chat, if there's one waiting. Only returned once. */
export function takeRecall(sessionId: string): Recalled | undefined {
  const recalled = pending.get(sessionId);
  pending.delete(sessionId);
  return recalled;
}

/** How a recalled page is shown to the Reporter. */
export function formatRecalled(r: Recalled, today: string): string {
  const body = r.text.split("\n").slice(1).join("\n").trim();
  const text = body.length > RECALLED_CHARS ? `${body.slice(0, RECALLED_CHARS)}…` : body;
  return `From their diary on ${longDate(r.date)} (${ago(r.date, today)}):\n${text}\n(Why it came to mind: ${r.why})`;
}

/** Roughly how long ago `date` was, worked out here because models get it wrong. */
export function ago(date: string, today: string): string {
  const days = Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${date}T12:00:00`)) / 86_400_000);
  if (days <= 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 11) return "about a week ago";
  if (days < 45) return `about ${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `about ${Math.round(days / 30)} months ago`;
  return `about ${Math.round(days / 365)} year${days < 548 ? "" : "s"} ago`;
}
