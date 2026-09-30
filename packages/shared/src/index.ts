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

/** SSE events streamed from POST /api/chat */
export type ChatEvent =
  | { event: "route"; data: { agent: string } }
  | { event: "token"; data: { text: string } }
  | { event: "done"; data: { agent: string } }
  | { event: "error"; data: { message: string } };

/** POST /api/print */
export const PrintRequest = z.object({ sessionId: z.string() });
export type PrintRequest = z.infer<typeof PrintRequest>;

export const PrintResult = z.object({
  date: DateStr,
  headline: z.string(),
  version: z.number().int(),
});
export type PrintResult = z.infer<typeof PrintResult>;

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
