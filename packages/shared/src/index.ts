// The contract between web and server. Change shapes here first.
// See docs/ENTRY_FORMAT.md and docs/API.md.
import { z } from "zod";

/** A diary day, e.g. "2026-09-30". */
export const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Msg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
export type Msg = z.infer<typeof Msg>;

/** One event from a calendar. All-day events have a plain date (YYYY-MM-DD) as `start` and `end`. */
export const CalendarEvent = z.object({
  title: z.string(),
  /** Local time with offset (2026-09-29T10:00:00+10:00), or a date for all-day events. */
  start: z.string(),
  /** Exclusive for all-day events, like ICS: a one-day event on the 29th ends on the 30th. */
  end: z.string().optional(),
  location: z.string().optional(),
  /** Which calendar it came from (its name in Settings). */
  calendar: z.string().optional(),
});
export type CalendarEvent = z.infer<typeof CalendarEvent>;

/**
 * One page of an entry. The first chat of the day is page 1 (the front page);
 * each later chat that gets printed adds a page. See docs/ENTRY_FORMAT.md.
 */
export const PageMeta = z
  .object({
    headline: z.string(),
    subhead: z.string().optional(),
    mood: z.number().int().min(1).max(10).optional(),
    tags: z.array(z.string()).default([]),
    people: z.array(z.string()).default([]),
    sessions: z.array(z.string()).default([]),
  })
  .loose();
export type PageMeta = z.infer<typeof PageMeta>;

export const EntryFrontmatter = z
  .object({
    date: DateStr,
    volume: z.number().int(),
    issue: z.number().int(),
    headline: z.string(),
    subhead: z.string().optional(),
    dateline: z.string().optional(),
    mood: z.number().int().min(1).max(10).optional(),
    tags: z.array(z.string()).default([]),
    people: z.array(z.string()).default([]),
    events: z.array(CalendarEvent).default([]),
    sessions: z.array(z.string()).default([]),
    /** Per-page details. The fields above are worked out from these. Empty on entries from before pages existed. */
    pages: z.array(PageMeta).default([]),
    version: z.number().int().default(1),
    model: z.string().optional(),
    created: z.string(),
    updated: z.string(),
  })
  // Unknown fields are preserved (users can add their own).
  .loose();
export type EntryFrontmatter = z.infer<typeof EntryFrontmatter>;

/** GET /api/entries/:date */
export const Entry = z.object({
  frontmatter: EntryFrontmatter,
  markdown: z.string(),
});
export type Entry = z.infer<typeof Entry>;

// In the file, pages after the first start with a marker comment and a rule:
//   <!-- page 2 -->
//
//   ---
const PAGE_BREAK = /\s*<!-- page \d+ -->[ \t]*(?:\r?\n)+(?:---[ \t]*(?:\r?\n|$)+)?/;

/** Split an entry body into its pages. Always returns at least one. */
export function splitPages(markdown: string): string[] {
  return markdown.split(PAGE_BREAK).map((p) => p.trim());
}

/** Join pages back into an entry body, numbering the markers in order. */
export function joinPages(pages: string[]): string {
  const body = pages.map((p, i) => (i === 0 ? p.trim() : `<!-- page ${i + 1} -->\n\n---\n\n${p.trim()}`));
  return `${body.join("\n\n")}\n`;
}

/** One row of GET /api/entries */
export const EntrySummary = EntryFrontmatter.pick({
  date: true,
  issue: true,
  headline: true,
  mood: true,
  tags: true,
});
export type EntrySummary = z.infer<typeof EntrySummary>;

/** A chat session: one conversation, saved to data/transcripts/<date>/<id>.json */
export const Session = z.object({
  id: z.string(),
  date: DateStr,
  created: z.string(),
  messages: z.array(Msg.extend({ agent: z.string().optional(), at: z.string().optional() })),
  /** Set when the page printed from this chat was deleted, so it isn't printed again by accident. */
  dropped: z.boolean().optional(),
});
export type Session = z.infer<typeof Session>;

/** POST /api/sessions */
export const CreateSessionRequest = z.object({ date: DateStr.optional() });
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

/** POST /api/chat. Omit `message` to have the Reporter open the interview. */
export const ChatRequest = z.object({
  sessionId: z.string(),
  message: z.string().min(1).optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

/**
 * Something the Editor-in-Chief thinks the diarist might want after a message. Only ever
 * offered as a button: nothing happens until they click it.
 */
export const Suggestion = z.discriminatedUnion("action", [
  z.object({ action: z.literal("print") }),
  z.object({
    action: z.literal("edit"),
    date: DateStr,
    /** Which page to edit, from 1. */
    page: z.number().int(),
    headline: z.string(),
    /** The message that sounded like an edit, to prefill the Edit box with. */
    instruction: z.string(),
  }),
]);
export type Suggestion = z.infer<typeof Suggestion>;

/** SSE events streamed from POST /api/chat */
export type ChatEvent =
  | { event: "route"; data: { agent: string } }
  | { event: "token"; data: { text: string } }
  /** Throw away the tokens so far: the reply slipped into another language and is being written again. */
  | { event: "reset"; data: Record<string, never> }
  | { event: "done"; data: { agent: string } }
  /** Sent after `done`, only when there's something to offer. */
  | { event: "suggest"; data: Suggestion }
  | { event: "error"; data: { message: string } };

/** POST /api/print */
export const PrintRequest = z.object({ sessionId: z.string() });
export type PrintRequest = z.infer<typeof PrintRequest>;

export const PrintResult = z.object({
  date: DateStr,
  headline: z.string(),
  version: z.number().int(),
  /** Which page was written, from 1. */
  page: z.number().int(),
});
export type PrintResult = z.infer<typeof PrintResult>;

/** POST /api/entries/:date/pages/:page/edit */
export const EditRequest = z.object({ instruction: z.string().trim().min(1) });
export type EditRequest = z.infer<typeof EditRequest>;

/** Result of an edit or delete. */
export const ChangeResult = z.object({
  date: DateStr,
  /** The page that changed, from 1 (0 when a whole entry was deleted). */
  page: z.number().int(),
  headline: z.string().optional(),
  /** True when the whole entry is gone (deleted, or its last page was). */
  deleted: z.boolean(),
  /** The version to restore to undo this change. */
  undo: z.number().int(),
});
export type ChangeResult = z.infer<typeof ChangeResult>;

/** One row of GET /api/entries/:date/versions */
export const VersionSummary = z.object({ version: z.number().int(), updated: z.string() });
export type VersionSummary = z.infer<typeof VersionSummary>;

/** Which model each agent role uses. */
export const ModelSettings = z.object({
  reporter: z.string().trim().min(1),
  copydesk: z.string().trim().min(1),
  router: z.string().trim().min(1),
});
export type ModelSettings = z.infer<typeof ModelSettings>;

/** A calendar's ICS link, from Settings. */
export const CalendarFeed = z.object({
  name: z.string().trim().min(1).max(40),
  /** The "secret address" in iCal format. webcal:// links work too. */
  url: z
    .string()
    .trim()
    .regex(/^(https?|webcal):\/\/\S+$/i, "Calendar links start with https:// or webcal://")
    .max(2000),
  /** Off keeps the link but leaves its events out. */
  enabled: z.boolean(),
});
export type CalendarFeed = z.infer<typeof CalendarFeed>;

/** GET /api/settings: the settings in use (saved ones, falling back to .env, then defaults). */
export const Settings = z.object({
  /** The diarist's name, used in prompts. "" for none. */
  name: z.string().trim().max(60),
  /** Shown in the masthead. */
  paperName: z.string().trim().min(1).max(60),
  /** The place printed before each story, e.g. MELBOURNE. */
  dateline: z.string().trim().min(1).max(40),
  /** Chats before this hour (0-12) count as the previous day. */
  dayCutoffHour: z.number().int().min(0).max(12),
  /** What the Reporter chats in and the paper is written in, e.g. "English". */
  language: z.string().trim().min(1).max(40),
  /** How the paper refers to the diarist, e.g. "he/him", "she/her", "they/them". "" for not set (gender-neutral). */
  pronouns: z.string().trim().max(30),
  /** ICS links whose events the Reporter sees. */
  calendars: z.array(CalendarFeed).max(20),
  /** "21:00": when to remind you if nothing's printed yet today. null for no reminder. */
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "A time like 21:00")
    .nullable(),
  models: ModelSettings,
});
export type Settings = z.infer<typeof Settings>;

/** PATCH /api/settings, and what's saved in data/settings.json. Only the fields given change. */
export const SettingsPatch = Settings.omit({ models: true })
  .partial()
  .extend({ models: ModelSettings.partial().optional() });
export type SettingsPatch = z.infer<typeof SettingsPatch>;

/** GET /api/calendar/today: today's events from every enabled calendar, and the names of any that couldn't be read. */
export const CalendarDay = z.object({ date: DateStr, events: z.array(CalendarEvent), failed: z.array(z.string()) });
export type CalendarDay = z.infer<typeof CalendarDay>;

/** POST /api/calendar/test */
export const CalendarTestRequest = z.object({ url: CalendarFeed.shape.url });
export type CalendarTestRequest = z.infer<typeof CalendarTestRequest>;

/** The calendar's own name (if the file has one) and its events today, to check a link before saving it. */
export const CalendarTest = z.object({ name: z.string().nullable(), events: z.array(CalendarEvent) });
export type CalendarTest = z.infer<typeof CalendarTest>;

/** GET /api/memory: the facts file (data/memory.md) */
export const Memory = z.object({ text: z.string() });
export type Memory = z.infer<typeof Memory>;

/** PUT /api/memory */
export const MemoryUpdate = z.object({ text: z.string().max(20_000) });
export type MemoryUpdate = z.infer<typeof MemoryUpdate>;

/** Result of saving or restoring the facts file. `undo` is the version to restore to undo it (null if it was new). */
export const MemoryChange = Memory.extend({ undo: z.number().int().nullable() });
export type MemoryChange = z.infer<typeof MemoryChange>;

/**
 * Something to follow up on later ("how did the exam go?"), picked up by the Archivist after a print.
 * Saved in data/threads.json. The Reporter sees open ones once they're due.
 */
export const Thread = z.object({
  id: z.string(),
  text: z.string(),
  /** When it makes sense to ask about it. */
  due: DateStr,
  /** "tender" for sad, stressful or private things, which the Reporter asks about gently. */
  tone: z.enum(["light", "tender"]),
  /** The diary day it came up. */
  from: DateStr,
  status: z.enum(["open", "resolved", "dismissed"]),
});
export type Thread = z.infer<typeof Thread>;

/** PATCH /api/threads/:id */
export const ThreadPatch = z.object({ status: z.enum(["resolved", "dismissed"]) });
export type ThreadPatch = z.infer<typeof ThreadPatch>;

/** What the Archivist changed after one print. GET /api/memory/log, newest first. */
export const MemoryLogEntry = z.object({
  at: z.string(),
  /** The diary day that was printed. */
  date: DateStr,
  /** e.g. "Added: Works at a bar", "Updated: ...", "Removed: ..." */
  facts: z.array(z.string()),
  threadsAdded: z.array(z.string()),
  threadsResolved: z.array(z.string()),
  /** Facts file version to restore to undo the fact changes (null if facts didn't change or the file was new). */
  undo: z.number().int().nullable(),
});
export type MemoryLogEntry = z.infer<typeof MemoryLogEntry>;

/** GET /api/health */
export const Health = z.object({
  ok: z.boolean(),
  version: z.string(),
  ollama: z.object({
    up: z.boolean(),
    host: z.string(),
    models: z.array(z.string()),
  }),
});
export type Health = z.infer<typeof Health>;

/** A phone or browser that's signed in. */
export const AuthDevice = z.object({
  /** Short id, safe to show. Not the session token. */
  id: z.string(),
  /** e.g. "iPhone", "Android", "Windows" */
  device: z.string(),
  created: z.string(),
  lastSeen: z.string(),
  /** The device asking. */
  current: z.boolean(),
});
export type AuthDevice = z.infer<typeof AuthDevice>;

/**
 * GET /api/auth. The computer the server runs on never needs to sign in. Other devices
 * (a phone through Tailscale) sign in with a passphrase, once it's set on the computer.
 */
export const AuthStatus = z.object({
  /** This request comes from the computer itself. */
  local: z.boolean(),
  /** Allowed in: local, or signed in. */
  signedIn: z.boolean(),
  passphraseSet: z.boolean(),
  /** Signed-in devices. Empty unless signed in. */
  devices: z.array(AuthDevice),
});
export type AuthStatus = z.infer<typeof AuthStatus>;

/** POST /api/auth/login */
export const LoginRequest = z.object({ passphrase: z.string().min(1).max(200) });
export type LoginRequest = z.infer<typeof LoginRequest>;

/** PUT /api/auth/passphrase (from the computer only). Signs every device out. */
export const PassphraseRequest = z.object({ passphrase: z.string().min(8, "Use at least 8 characters").max(200) });
export type PassphraseRequest = z.infer<typeof PassphraseRequest>;

/** A browser's push subscription, as PushSubscription.toJSON() gives it. */
export const PushSubscriptionInfo = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});
export type PushSubscriptionInfo = z.infer<typeof PushSubscriptionInfo>;

/** GET /api/push/key: the server's public key, which the browser needs to subscribe. */
export const PushKey = z.object({ publicKey: z.string() });
export type PushKey = z.infer<typeof PushKey>;

/** Non-2xx responses */
export const ApiError = z.object({
  error: z.object({
    code: z.enum([
      "not_found",
      "invalid_request",
      "llm_unavailable",
      "llm_bad_output",
      "calendar_unavailable",
      "unauthorized",
      "forbidden",
      "too_many_attempts",
    ]),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
