/**
 * Pages: an entry is one file per day, but each printed chat is its own page.
 * Page 1 is the front page. The entry's headline, mood, tags etc. are worked out
 * from the pages here, so there's one place that decides them.
 */
import { joinPages, splitPages, type Entry, type PageMeta, type Session } from "@daily-you/shared";
import { config } from "../config";
import type { Story } from "../schemas/story";
import { isoLocal } from "../store/dates";
import { issueNumbers } from "../store/entries";

export type Page = { meta: PageMeta; markdown: string };

const firstHeading = (markdown: string) => /^#{1,2} (.+)$/m.exec(markdown)?.[1]?.trim() ?? "";

/**
 * The pages of an entry. Entries from before pages existed have no `pages` in their
 * frontmatter, so the whole body becomes page 1 with the entry's own details.
 */
export function pagesOf(entry: Entry): Page[] {
  const f = entry.frontmatter;
  return splitPages(entry.markdown).map((markdown, i) => {
    const legacy = i === 0 && f.pages.length === 0;
    const meta: PageMeta = f.pages[i] ??
      (legacy
        ? { headline: f.headline, subhead: f.subhead, mood: f.mood, tags: f.tags, people: f.people, sessions: f.sessions }
        : { headline: firstHeading(markdown), tags: [], people: [], sessions: [] });
    return { meta, markdown };
  });
}

export function storyToMarkdown(story: Story, dateline: string): string {
  const sections = story.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  const quote = story.pull_quote ? `\n\n> "${story.pull_quote.replace(/^"|"$/g, "")}"` : "";
  return `# ${story.headline}\n\n*${story.subhead}*\n\n**${dateline.toUpperCase()}:** ${story.lede}\n\n${sections}${quote}\n`;
}

export function storyToPage(story: Story, sessions: string[]): Page {
  return {
    markdown: storyToMarkdown(story, config.dateline),
    meta: {
      headline: story.headline,
      subhead: story.subhead,
      mood: story.mood,
      tags: story.tags,
      people: story.people,
      sessions,
    },
  };
}

const unique = (xs: string[]) => [...new Set(xs)];

/**
 * Build the entry for a day from its pages, keeping anything else from the existing
 * entry (fields added by hand, events, created). Bumps the version.
 */
export async function buildEntry(date: string, pages: Page[], existing: Entry | null, model?: string): Promise<Entry> {
  const front = pages[0]!.meta;
  const moods = pages.map((p) => p.meta.mood).filter((m): m is number => m !== undefined);
  const { issue, volume } = await issueNumbers(date);
  const now = isoLocal();

  const frontmatter: Entry["frontmatter"] = {
    ...existing?.frontmatter, // keep any fields the user added by hand
    date,
    volume,
    issue,
    headline: front.headline,
    subhead: front.subhead,
    dateline: config.dateline.toUpperCase(),
    mood: moods.length ? Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) : undefined,
    tags: unique(pages.flatMap((p) => p.meta.tags)),
    people: unique(pages.flatMap((p) => p.meta.people)),
    events: existing?.frontmatter.events ?? [],
    sessions: unique(pages.flatMap((p) => p.meta.sessions)),
    pages: pages.map((p) => p.meta),
    version: (existing?.frontmatter.version ?? 0) + 1,
    model: model ?? existing?.frontmatter.model,
    created: existing?.frontmatter.created ?? now,
    updated: now,
  };
  // Leave out empty optional fields rather than writing `mood: null`.
  for (const key of ["subhead", "mood", "model"] as const) {
    if (frontmatter[key] === undefined) delete frontmatter[key];
  }
  return { frontmatter, markdown: joinPages(pages.map((p) => p.markdown)) };
}

/**
 * A transcript as the Copy Desk reads it. Messages tagged `copydesk` are left out: those
 * came from a short-lived chat-edit feature (now removed) and aren't part of the story.
 */
export function formatTranscripts(sessions: Session[]): string {
  const chats = sessions.map((s, i) => {
    const lines = s.messages
      .filter((m) => m.agent !== "copydesk")
      .map((m) => `${m.role === "user" ? "DIARIST" : "REPORTER"}: ${m.content}`)
      .join("\n");
    return sessions.length > 1 ? `--- Chat ${i + 1} ---\n${lines}` : lines;
  });
  return chats.join("\n\n");
}

export function formatPages(pages: Page[]): string {
  return pages.map((p, i) => `--- Page ${i + 1} ---\n${p.markdown}`).join("\n\n");
}
