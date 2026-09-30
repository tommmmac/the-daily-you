// Terminal chat with a basic Reporter, then /print it via the Copy Desk.
//
// Usage: bun spikes/copydesk/chat.ts [--model qwen2.5:14b]
// Commands: /print  write the entry   /quit  exit without printing

import { MODEL, OLLAMA, printEntry, type Msg, type Transcript } from "./copydesk";

const now = new Date();
const date = now.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const weekday = now.toLocaleDateString("en-AU", { weekday: "long" });

const REPORTER = `You are the Reporter for "The Daily You", a personal newspaper about one person's life.
It's ${weekday} ${date}, ${now.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}. You're interviewing the diarist about their day so the Copy Desk can write it up.

- Be warm, casual and brief, like a friend who's a good journalist. Match their tone.
- The diarist is a young Australian and uses casual slang: "sick", "mad", "insane" usually mean great; "ngl" = not gonna lie; "lol" is just tone. If something's ambiguous, ask rather than assume.
- Ask ONE question at a time. Keep replies to 1-2 short sentences.
- Follow up on interesting details (who, what happened, how it felt) before moving on.
- Cover the day broadly: what they did, people they saw, how they're feeling, anything on their mind.
- After a few exchanges, ask how they'd rate the day out of 10 if they haven't said.
- When you have enough for a story, say so and suggest they type /print.`;

const messages: Msg[] = [];

async function reporterReply(): Promise<string> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      keep_alive: "30m",
      messages: [{ role: "system", content: REPORTER }, ...messages],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}: ${await res.text()}`);

  // Ollama streams one JSON object per line.
  let reply = "";
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const token = JSON.parse(line).message?.content ?? "";
      reply += token;
      process.stdout.write(token);
    }
  }
  process.stdout.write("\n\n");
  return reply;
}

async function reporterTurn() {
  process.stdout.write("\x1b[36mReporter:\x1b[0m ");
  messages.push({ role: "assistant", content: await reporterReply() });
}

console.log(`\nThe Daily You, ${weekday} ${date} (${MODEL})`);
console.log("Chat about your day. /print to go to print, /quit to exit.\n");

// Seed with a user turn so the model opens the interview.
messages.push({ role: "user", content: "(The diarist has opened the app. Greet them and ask about their day.)" });
await reporterTurn();
messages.shift(); // drop the seed so it isn't in the transcript

process.stdout.write("\x1b[33mYou:\x1b[0m ");
for await (const line of console) {
  const text = line.trim();
  if (text === "/quit") break;
  if (text === "/print") {
    const transcript: Transcript = { date, dateline: "MELBOURNE", messages };
    await Bun.write(`${import.meta.dir}/out/${date}.transcript.json`, JSON.stringify(transcript, null, 2));
    console.log("\nGoing to print...\n");
    const { md, path, secs } = await printEntry(transcript);
    console.log(md);
    console.log(`[${MODEL}] ${secs}s -> ${path}`);
    break;
  }
  if (text) {
    messages.push({ role: "user", content: text });
    console.log();
    await reporterTurn();
  }
  process.stdout.write("\x1b[33mYou:\x1b[0m ");
}
process.exit(0);
