// Copy Desk spike: turn a chat transcript into a news-style entry.
// Step 1: transcript -> JSON (LLM, schema-constrained)
// Step 2: JSON -> Markdown (plain template, no LLM)
//
// Usage: bun spikes/copydesk/copydesk.ts [transcript.json] [--model qwen2.5:14b]

const args = Bun.argv.slice(2);
const modelFlag = args.indexOf("--model");
export const MODEL = modelFlag >= 0 ? args[modelFlag + 1] : "qwen2.5:14b";
const transcriptPath =
  args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--model") ??
  `${import.meta.dir}/transcript.json`;
export const OLLAMA = process.env.OLLAMA_HOST ?? "http://localhost:11434";

export type Msg = { role: "user" | "assistant"; content: string };
export type Transcript = { date: string; dateline?: string; messages: Msg[] };
type Story = {
  headline: string;
  subhead: string;
  lede: string;
  sections: { heading: string; body: string }[];
  pull_quote: string;
  mood: number;
  tags: string[];
  people: string[];
};

// Ollama constrains the output to this JSON schema.
const storySchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    subhead: { type: "string" },
    lede: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: { heading: { type: "string" }, body: { type: "string" } },
        required: ["heading", "body"],
      },
    },
    pull_quote: { type: "string" },
    mood: { type: "integer" },
    tags: { type: "array", items: { type: "string" } },
    people: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "subhead", "lede", "sections", "pull_quote", "mood", "tags", "people"],
};

const SYSTEM = `You are the Copy Desk of "The Daily You", a personal newspaper with exactly one reader: the diarist.
Turn the interview transcript into today's front-page story about the diarist's day.

Style:
- Write like a witty but warm newspaper: punchy headline (max ~12 words, headline case), a subhead, a strong lede paragraph.
- Refer to the diarist in the third person as "the diarist" or a fitting epithet ("Local Man", "our correspondent"). Keep it affectionate, never mean.
- Only use facts the DIARIST stated. The REPORTER's questions may contain wrong guesses; never treat them as facts unless the diarist confirmed them.
- Do not invent people, places, times, events or feelings. Colour and wit are fine; new facts are not.
- The diarist is a young Australian using casual slang: "sick", "mad", "insane" usually mean great; "ngl" = not gonna lie.
- 2-4 short sections, each with a heading and 1-2 paragraphs. Cover everything meaningful they mentioned, including feelings and worries, honestly.
- pull_quote: a real quote from the diarist's messages, lightly cleaned up (fix spelling/caps, keep their voice).
- mood: 1-10, for how the day went overall. If they rated their day, use that number.
- tags: 2-5 short lower-case topics. people: names of people mentioned (not the diarist).

Return only JSON matching the schema.`;

function formatTranscript(t: Transcript): string {
  return t.messages
    .map((m) => `${m.role === "user" ? "DIARIST" : "REPORTER"}: ${m.content}`)
    .join("\n");
}

export async function writeStory(t: Transcript): Promise<Story> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: storySchema,
      options: { temperature: 0.7 },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Date: ${t.date}\n\nTranscript:\n${formatTranscript(t)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { message: { content: string } };
  return JSON.parse(data.message.content) as Story;
}

export function toMarkdown(t: Transcript, s: Story): string {
  const yamlList = (xs: string[]) => `[${xs.map((x) => JSON.stringify(x)).join(", ")}]`;
  const dateline = (t.dateline ?? "HOME").toUpperCase();
  const sections = s.sections.map((sec) => `## ${sec.heading}\n\n${sec.body}`).join("\n\n");
  return `---
date: ${t.date}
headline: ${JSON.stringify(s.headline)}
subhead: ${JSON.stringify(s.subhead)}
dateline: ${dateline}
mood: ${s.mood}
tags: ${yamlList(s.tags)}
people: ${yamlList(s.people)}
model: ${MODEL}
---

# ${s.headline}

*${s.subhead}*

**${dateline}** — ${s.lede}

${sections}

> "${s.pull_quote}" — the diarist
`;
}

// Write the entry to out/ and return its path.
export async function printEntry(t: Transcript): Promise<{ md: string; path: string; secs: string }> {
  const started = performance.now();
  const story = await writeStory(t);
  const secs = ((performance.now() - started) / 1000).toFixed(1);
  const md = toMarkdown(t, story);
  const path = `${import.meta.dir}/out/${t.date}.${MODEL.replace(/[:/]/g, "_")}.md`;
  await Bun.write(path, md);
  return { md, path, secs };
}

if (import.meta.main) {
  const transcript = (await Bun.file(transcriptPath).json()) as Transcript;
  const { md, path, secs } = await printEntry(transcript);
  console.log(md);
  console.error(`\n[${MODEL}] ${secs}s -> ${path}`);
}
