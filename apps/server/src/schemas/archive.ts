import { z } from "zod";

/**
 * What the Archivist returns after a print. Applied by newsroom/archive.ts:
 * fact edits go into data/memory.md, threads into data/threads.json.
 * Every field is required (empty strings/lists when unused) so small models fill it in reliably.
 */
export const ArchiveNotes = z.object({
  facts: z.array(
    z.object({
      op: z.enum(["add", "update", "remove"]),
      section: z.string(),
      /** The new line (for add and update). */
      text: z.string(),
      /** The exact existing line (for update and remove), "" for add. */
      old: z.string(),
    }),
  ),
  threads_new: z.array(
    z.object({
      text: z.string().min(1),
      /** The day it happens, YYYY-MM-DD, or "" if there's no particular day. Code works out when to ask. */
      when: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
      tone: z.enum(["light", "tender"]),
    }),
  ),
  /** Ids of open threads this chat answered. */
  threads_resolved: z.array(z.string()),
});
export type ArchiveNotes = z.infer<typeof ArchiveNotes>;
