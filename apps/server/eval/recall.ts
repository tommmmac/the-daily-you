/**
 * Recall eval: does the Morgue bring up the right past day? Needs Ollama, so it's not
 * part of `bun test`. Run with `bun run eval:recall` from apps/server.
 *
 * Builds ~300 fake diary days in a temp folder: mostly routine filler that shares words
 * with a dozen special "needle" days. Then, for things you might say while journaling,
 * checks whether search finds the needle and whether the picker brings it up (or, for
 * messages with no real connection, brings up nothing).
 *
 * It's fake data I wrote myself, so it's for comparing changes, not for absolute numbers.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Entry } from "@daily-you/shared";

const dataDir = await mkdtemp(join(tmpdir(), "daily-you-eval-"));
process.env.DATA_DIR = dataDir;
const { writeEntry } = await import("../src/store/entries");
const morgue = await import("../src/morgue");
const { pickCallback } = await import("../src/morgue/recall");
const { config } = await import("../src/config");

const TODAY = "2026-10-01";

// Seeded, so every run builds the same diary.
let seed = 42;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const pickN = <T,>(xs: T[], n: number) => [...xs].sort(() => rand() - 0.5).slice(0, n);

const themes: Record<string, { headlines: string[]; lines: string[] }> = {
  gym: {
    headlines: ["Back On The Wall", "Leg Day Survived", "Bouldering Session", "Gym Before Class"],
    lines: [
      "Went bouldering with John after uni, finally sent the purple V3.",
      "Gym was packed so I just did a quick upper body session.",
      "John and I tried the new routes at the climbing gym, my forearms are dead.",
      "Climbed for two hours, skin on my fingers is wrecked.",
      "Skipped the gym again, need to get back into a routine.",
    ],
  },
  priya: {
    headlines: ["Coffee Catch-Up", "Long Lunch With Priya", "Brunch Club"],
    lines: [
      "Grabbed coffee with Priya on Degraves St, she's still stressing about job applications.",
      "Priya came over and we watched trashy reality TV.",
      "Lunch with Priya, she's been applying everywhere and hearing nothing back.",
      "Got brunch with Priya and Jess, way too many hash browns.",
    ],
  },
  bike: {
    headlines: ["Two Wheels To Campus", "Windy Ride In", "Commute Notes"],
    lines: [
      "Rode my bike to uni, the headwind on Dandenong Rd was brutal.",
      "Cycled in this morning, nearly got doored on Chapel St.",
      "Pumped up the bike tyres before riding to campus.",
      "Rode home in the rain, absolutely soaked.",
    ],
  },
  mum: {
    headlines: ["Sunday Call Home", "Dinner At Mum's", "Family Lunch"],
    lines: [
      "Called Mum for our usual Sunday chat, she's redoing the garden.",
      "Had dinner at Mum and Dad's, she made the lasagne.",
      "Mum sent me twenty photos of the dog.",
      "Helped Dad fix the gutter while Mum cooked.",
    ],
  },
  uni: {
    headlines: ["Library Grind", "Assignment Crunch", "Group Project Chaos"],
    lines: [
      "Spent all afternoon in the library working on the FIT2004 assignment.",
      "Lecture was dry but the tute was actually useful.",
      "Group project meeting went nowhere, nobody had done their part.",
      "Studied for the COMP3000 midsem, recursion is still breaking my brain.",
      "Submitted the databases assignment at 11:58pm, cutting it close.",
    ],
  },
  work: {
    headlines: ["Shift At The Cafe", "Long Shift", "Busy Saturday"],
    lines: [
      "Worked a double at the cafe, my feet hurt.",
      "Quiet shift at work, cleaned the coffee machine twice.",
      "A customer yelled at me about oat milk, cool.",
    ],
  },
  chill: {
    headlines: ["Slow Day", "Lazy Sunday", "Nothing Much"],
    lines: [
      "Did basically nothing today and it was great.",
      "Cooked a big batch of curry for the week.",
      "Went for a walk around Albert Park lake.",
      "Played Mario Kart with my housemates until 1am.",
    ],
  },
};
const moods = ["Pretty good day overall.", "Tired but happy.", "Bit of a meh day.", ""];

const needles: { date: string; headline: string; body: string }[] = [
  { date: "2026-04-08", headline: "Chain Snaps On The Hill", body: "The chain snapped halfway up Wellington Rd and I had to walk the bike home. Bike shop says new chain and cassette." },
  { date: "2026-06-19", headline: "Priya Lands The Job", body: "Priya finally heard back, she got the role at Atlassian! We got dumplings in Chinatown to celebrate." },
  { date: "2026-02-14", headline: "Quiet Weekend", body: "Nobody replied to my messages all weekend. The house felt really empty and I just lay in bed scrolling." },
  { date: "2026-05-03", headline: "Nan Turns 90", body: "Drove up to Ballarat for Nan's 90th. The whole family was there, she cried during the speeches." },
  { date: "2026-07-21", headline: "Results Are In", body: "Marks came out for COMP3000, got an HD on the final! All that recursion pain paid off." },
  { date: "2026-09-12", headline: "Ankle Down", body: "Rolled my ankle coming off the top of a boulder problem. It swelled up like a tennis ball." },
  { date: "2026-08-09", headline: "Tame Impala Live", body: "Saw Tame Impala at Rod Laver Arena, the lights were insane and my ears are still ringing." },
  { date: "2026-09-20", headline: "Blow-Up With Mum", body: "Had a fight with Mum on the phone about moving out. We both said stuff we didn't mean." },
  { date: "2026-09-24", headline: "John Turns Down Climbing", body: "Asked him about Sunday. He said no, again. Not sure what's going on with him." },
  { date: "2026-03-14", headline: "Market Morning", body: "Wandered around the Queen Vic market, bought way too much cheese and a little cactus." },
  { date: "2026-09-02", headline: "Interview Nerves", body: "Couldn't sleep before the Canva interview, kept rehearsing answers in my head until 3am." },
  { date: "2026-06-30", headline: "Where Are My Keys", body: "Spent forty minutes looking for my keys. They were in the fridge. I need help." },
];

// Things you might say while journaling, and the needle a friend would bring up (null: nothing).
const cases: { said: string; expect: string | null }[] = [
  { said: "my bike is making a horrible grinding noise again", expect: "Chain Snaps On The Hill" },
  { said: "had lunch with Priya, she's loving it at her new work", expect: "Priya Lands The Job" },
  { said: "everyone's away this weekend and I'm kind of just alone at home", expect: "Quiet Weekend" },
  { said: "rang Nan today, she's been a bit unwell", expect: "Nan Turns 90" },
  { said: "enrolled in COMP4000 for next semester", expect: "Results Are In" },
  { said: "going bouldering tonight for the first time in a while", expect: "Ankle Down" },
  { said: "Tame Impala just announced another Melbourne show", expect: "Tame Impala Live" },
  { said: "Mum called and we actually had a nice chat", expect: "Blow-Up With Mum" },
  { said: "John finally said yes to climbing on Sunday", expect: "John Turns Down Climbing" },
  { said: "went back to the Queen Vic market this morning", expect: "Market Morning" },
  { said: "Canva emailed me back today!!", expect: "Interview Nerves" },
  { said: "I've lost my wallet now, can't find it anywhere", expect: "Where Are My Keys" },
  { said: "studied in the library most of the day", expect: null },
  { said: "made a big pot of soup and watched a movie", expect: null },
  { said: "pretty normal shift at the cafe", expect: null },
  { said: "weather was nice so I walked to the shops", expect: null },
];

// Build the diary: 2025-12-01 to the day before TODAY, one page a day.
const byDate = new Map(needles.map((n) => [n.date, n]));
let count = 0;
for (let d = new Date("2025-12-01T12:00:00"); d.toLocaleDateString("en-CA") < TODAY; d.setDate(d.getDate() + 1)) {
  const date = d.toLocaleDateString("en-CA");
  let headline: string;
  let body: string;
  const needle = byDate.get(date);
  if (needle) ({ headline, body } = needle);
  else {
    const [a, b] = pickN(Object.keys(themes), 2);
    headline = pick(themes[a!]!.headlines);
    body = [...pickN(themes[a!]!.lines, 2), pick(themes[b!]!.lines), pick(moods)].filter(Boolean).join(" ");
  }
  const entry: Entry = {
    frontmatter: {
      date,
      volume: 1,
      issue: ++count,
      headline,
      tags: [],
      people: [],
      events: [],
      sessions: [],
      pages: [{ headline, tags: [], people: [], sessions: [] }],
      version: 1,
      created: `${date}T21:00:00+10:00`,
      updated: `${date}T21:00:00+10:00`,
    },
    markdown: `# ${headline}\n\n${body}`,
  };
  await writeEntry(entry);
}

console.log(`${count} days, ${needles.length} needles, ${cases.length} cases. Embed: ${config.models.embed}, picker: ${config.models.router}\n`);
let t = performance.now();
await morgue.syncAll();
console.log(`Indexed in ${((performance.now() - t) / 1000).toFixed(1)}s\n`);

// Search alone (no model), at a few settings: how often is the right day among the 20 the picker sees?
console.log("diversity  right day in top 20   median rank");
for (const diversity of [0, 0.15, morgue.DIVERSITY, 0.5, 0.7]) {
  const ranks: number[] = [];
  for (const c of cases.filter((c) => c.expect)) {
    const hits = await morgue.search(c.said, { before: TODAY, diversity });
    ranks.push(hits.findIndex((h) => h.headline === c.expect) + 1 || Infinity);
  }
  const sorted = [...ranks].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mark = diversity === morgue.DIVERSITY ? "  (default)" : "";
  console.log(`${diversity.toFixed(1).padEnd(11)}${`${ranks.filter((r) => r <= 20).length}/${ranks.length}`.padEnd(22)}${median === Infinity ? ">20" : median}${mark}`);
}
console.log();

const rows: string[][] = [];
let found = 0, top1 = 0, right = 0, wrong = 0, quiet = 0, spoke = 0;
t = performance.now();
for (const c of cases) {
  const hits = await morgue.search(c.said, { before: TODAY });
  const rank = c.expect ? hits.findIndex((h) => h.headline === c.expect) + 1 : 0;
  const picked = await pickCallback(TODAY, [c.said], hits);
  if (c.expect) {
    if (rank) found++;
    if (rank === 1) top1++;
    if (picked?.headline === c.expect) right++;
    else if (picked) wrong++;
  } else if (picked) spoke++;
  else quiet++;
  const verdict = c.expect ? (picked?.headline === c.expect ? "✓" : picked ? "✗ wrong" : "✗ none") : picked ? "✗ spoke" : "✓";
  rows.push([c.said, c.expect ? (rank ? String(rank) : ">20") : "", picked?.headline ?? "(none)", verdict, verdict === "✓" ? "" : picked?.why ?? ""]);
}
const perPick = (performance.now() - t) / cases.length / 1000;

const w = [52, 6, 26];
console.log("said".padEnd(w[0]!) + "rank".padEnd(w[1]!) + "picked".padEnd(w[2]!) + "ok");
console.log("-".repeat(95));
for (const r of rows) {
  console.log(r[0]!.slice(0, w[0]! - 2).padEnd(w[0]!) + r[1]!.padEnd(w[1]!) + r[2]!.slice(0, w[2]! - 2).padEnd(w[2]!) + r[3]);
  if (r[4]) console.log(`    why: ${r[4]}`);
}

const withNeedle = cases.filter((c) => c.expect).length;
console.log(`
Search: right day in the top 20 for ${found}/${withNeedle}, at #1 for ${top1}/${withNeedle}
Picker: brought up the right day ${right}/${withNeedle}, a wrong day ${wrong}/${withNeedle}
        stayed quiet when nothing fit ${quiet}/${cases.length - withNeedle}
About ${perPick.toFixed(1)}s per message (search + pick)`);

morgue.closeIndex();
// EVAL_KEEP=1 keeps the fake diary around to poke at.
if (process.env.EVAL_KEEP) console.log(`\nKept the fake diary in ${dataDir}`);
else await rm(dataDir, { recursive: true, force: true });
