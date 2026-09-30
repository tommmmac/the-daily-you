import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Entry } from "@daily-you/shared";

// Point the data folder at a temp dir before the store modules read config.
const dataDir = await mkdtemp(join(tmpdir(), "daily-you-test-"));
process.env.DATA_DIR = dataDir;
const { diaryDate } = await import("../src/store/dates");
const entries = await import("../src/store/entries");
const sessions = await import("../src/store/sessions");
const { storyToMarkdown } = await import("../src/newsroom/pages");

afterAll(() => rm(dataDir, { recursive: true, force: true }));

const entry = (date: string, version = 1): Entry => ({
  frontmatter: {
    date,
    volume: 1,
    issue: 1,
    headline: 'Local Man Fixes Bike: "Easy," He Claims',
    tags: ["cycling"],
    people: ["Sam"],
    events: [],
    sessions: [],
    pages: [],
    version,
    created: "2026-09-29T21:00:00+10:00",
    updated: "2026-09-29T21:00:00+10:00",
    custom_field: "kept",
  },
  markdown: "# Local Man Fixes Bike\n\nBody text.\n",
});

describe("diaryDate", () => {
  test("before the cutoff counts as the previous day", () => {
    expect(diaryDate(new Date(2026, 8, 30, 1, 30), 4)).toBe("2026-09-29");
    expect(diaryDate(new Date(2026, 8, 30, 4, 0), 4)).toBe("2026-09-30");
    expect(diaryDate(new Date(2026, 9, 1, 0, 10), 4)).toBe("2026-09-30");
  });
});

describe("entries", () => {
  test("round-trips frontmatter and body, keeping unknown fields", async () => {
    await entries.writeEntry(entry("2026-09-29"));
    const back = await entries.readEntry("2026-09-29");
    expect(back?.frontmatter.headline).toBe('Local Man Fixes Bike: "Easy," He Claims');
    expect(back?.frontmatter.date).toBe("2026-09-29");
    expect(back?.frontmatter.custom_field).toBe("kept");
    expect(back?.markdown).toBe("# Local Man Fixes Bike\n\nBody text.\n");
  });

  test("saves the old version before overwriting", async () => {
    await entries.writeEntry(entry("2026-09-29", 2));
    expect(await Bun.file(join(dataDir, "versions", "2026-09-29", "v1.md")).exists()).toBe(true);
  });

  test("lists newest first and numbers new issues", async () => {
    await entries.writeEntry(entry("2026-09-30"));
    expect((await entries.listEntries()).map((e) => e.date)).toEqual(["2026-09-30", "2026-09-29"]);
    expect(await entries.issueNumbers("2026-10-01")).toEqual({ issue: 3, volume: 1 });
    expect(await entries.issueNumbers("2027-01-01")).toEqual({ issue: 3, volume: 2 });
  });

  test("delete keeps a copy that can be restored as a new version", async () => {
    await entries.writeEntry(entry("2026-09-28", 3));
    expect(await entries.deleteEntry("2026-09-28")).toBe(true);
    expect(await entries.readEntry("2026-09-28")).toBeNull();
    expect((await entries.listVersions("2026-09-28")).map((v) => v.version)).toEqual([3]);

    const back = await entries.restoreVersion("2026-09-28", 3);
    expect(back?.frontmatter.version).toBe(4);
    expect((await entries.readEntry("2026-09-28"))?.frontmatter.custom_field).toBe("kept");
    expect(await entries.restoreVersion("2026-09-28", 99)).toBeNull();
    expect(await entries.deleteEntry("1999-01-01")).toBe(false);
  });

  test("missing entry is null", async () => {
    expect(await entries.readEntry("1999-01-01")).toBeNull();
  });
});

describe("sessions", () => {
  test("saves messages and finds sessions by date", async () => {
    const s = await sessions.createSession("2026-09-30");
    await sessions.addMessage(s, { role: "user", content: "fixed my bike" });
    const back = await sessions.getSession(s.id);
    expect(back?.messages[0]?.content).toBe("fixed my bike");
    expect((await sessions.sessionsForDate("2026-09-30")).map((x) => x.id)).toContain(s.id);
  });

  test("rejects ids that could escape the data folder", async () => {
    expect(await sessions.getSession("../../etc/passwd")).toBeNull();
  });
});

describe("settings", () => {
  test("saved settings win over defaults, and a partial save keeps the rest", async () => {
    const { config } = await import("../src/config");
    const { currentSettings, updateSettings } = await import("../src/store/settings");
    const before = currentSettings();

    await updateSettings({ name: "Tom", paperName: "The Tom Times", models: { reporter: "qwen2.5:7b" } });
    expect(config.userName).toBe("Tom");
    expect(config.paperName).toBe("The Tom Times");
    expect(config.models.reporter).toBe("qwen2.5:7b");
    expect(config.models.copydesk).toBe(before.models.copydesk);

    const after = await updateSettings({ dateline: "MELBOURNE", models: { copydesk: "llama3.1:8b" } });
    expect(after.name).toBe("Tom");
    expect(after.models).toEqual({ ...before.models, reporter: "qwen2.5:7b", copydesk: "llama3.1:8b" });
    expect(config.dateline).toBe("MELBOURNE");

    await rm(join(dataDir, "settings.json"));
    expect(currentSettings()).toEqual(before);
  });
});

describe("storyToMarkdown", () => {
  test("lays out headline, dateline, sections and quote", () => {
    const md = storyToMarkdown(
      {
        headline: "Local Man Rides Bike",
        subhead: "3km, no incidents",
        lede: "He rode.",
        sections: [{ heading: "The Ride", body: "It was fine." }],
        pull_quote: "felt great",
        mood: 7,
        tags: [],
        people: [],
      },
      "melbourne",
    );
    expect(md).toContain("# Local Man Rides Bike");
    expect(md).toContain("**MELBOURNE:** He rode.");
    expect(md).toContain("## The Ride");
    expect(md).toContain('> "felt great"');
  });
});
