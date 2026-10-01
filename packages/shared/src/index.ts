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

export const CalendarEvent = z.object({
  title: z.string(),
  start: z.string(),
  end: z.string().optional(),
  location: z.string().optional(),
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
  models: ModelSettings,
});
export type Settings = z.infer<typeof Settings>;

/** PATCH /api/settings, and what's saved in data/settings.json. Only the fields given change. */
export const SettingsPatch = Settings.omit({ models: true })
  .partial()
  .extend({ models: ModelSettings.partial().optional() });
export type SettingsPatch = z.infer<typeof SettingsPatch>;

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

/** Non-2xx responses */
export const ApiError = z.object({
  error: z.object({
    code: z.enum(["not_found", "invalid_request", "llm_unavailable", "llm_bad_output", "unauthorized"]),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
