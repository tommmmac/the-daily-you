/**
 * Structured outputs an agent can be asked for, by name. An agent with
 * `output: story` in its manifest replies with JSON matching Story.
 */
import type { z } from "zod";
import { ArchiveNotes } from "./archive";
import { Story } from "./story";

export const OUTPUTS: Record<string, z.ZodType> = {
  story: Story,
  archive_notes: ArchiveNotes,
};
