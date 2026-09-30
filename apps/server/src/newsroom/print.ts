/**
 * Going to print: a day's transcripts -> Story (the Copy Desk agent) -> Markdown (template).
 * Called by POST /api/print. Two steps so small local models stay reliable:
 * the model only has to fill in JSON, and the layout is plain code.
 */
import type { Entry, EntryFrontmatter, Session } from "@daily-you/shared";
import { getAgent } from "../agents/_engine/registry";
import { promptContext, runStructured } from "../agents/_engine/run";
import { config } from "../config";
import type { Story } from "../schemas/story";
import { isoLocal } from "../store/dates";
import { issueNumbers, readEntry, writeEntry } from "../store/entries";

function formatTranscripts(sessions: Session[]): string {
  const chats = sessions.map((s, i) => {
    const lines = s.messages.map((m) => `${m.role === "user" ? "DIARIST" : "REPORTER"}: ${m.content}`).join("\n");
    return sessions.length > 1 ? `--- Chat ${i + 1} ---\n${lines}` : lines;
  });
  return `Transcript:\n${chats.join("\n\n")}`;
}

export function storyToMarkdown(story: Story, dateline: string): string {
  const sections = story.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  const quote = story.pull_quote ? `\n\n> "${story.pull_quote.replace(/^"|"$/g, "")}"` : "";
  return `# ${story.headline}\n\n*${story.subhead}*\n\n**${dateline.toUpperCase()}:** ${story.lede}\n\n${sections}${quote}\n`;
}

/**
 * Print (or reprint) the entry for a day from all of that day's chats.
 * Phase 1: a reprint rewrites the whole entry; the old one goes to versions/.
 */
export async function printDay(date: string, sessions: Session[]): Promise<Entry> {
  const copydesk = getAgent("copydesk");
  const story = await runStructured<Story>(copydesk, formatTranscripts(sessions), promptContext(date));
  const existing = await readEntry(date);
  const { issue, volume } = await issueNumbers(date);
  const now = isoLocal();

  const frontmatter: EntryFrontmatter = {
    ...existing?.frontmatter, // keep any fields the user added by hand
    date,
    volume,
    issue,
    headline: story.headline,
    subhead: story.subhead,
    dateline: config.dateline.toUpperCase(),
    mood: story.mood,
    tags: story.tags,
    people: story.people,
    events: existing?.frontmatter.events ?? [],
    sessions: sessions.map((s) => s.id),
    version: (existing?.frontmatter.version ?? 0) + 1,
    model: config.models[copydesk.model],
    created: existing?.frontmatter.created ?? now,
    updated: now,
  };

  const entry: Entry = { frontmatter, markdown: storyToMarkdown(story, config.dateline) };
  await writeEntry(entry);
  return entry;
}
