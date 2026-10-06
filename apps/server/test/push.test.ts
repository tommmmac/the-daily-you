import { afterAll, describe, expect, test } from "bun:test";
import { createECDH, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "daily-you-push-"));
process.env.DATA_DIR = dataDir;
const { checkReminder, reminderDue, subscribe } = await import("../src/push");
const { writeEntry } = await import("../src/store/entries");

// Local times. The day starts at 4am by default, so 1am belongs to the day before.
const at = (s: string) => new Date(s);

describe("reminderDue", () => {
  test("from the time, for a few hours, once a day", () => {
    expect(reminderDue(at("2026-10-03T20:59:00"), "21:00", null)).toBe(false);
    expect(reminderDue(at("2026-10-03T21:00:00"), "21:00", null)).toBe(true);
    expect(reminderDue(at("2026-10-03T23:30:00"), "21:00", null)).toBe(true);
    expect(reminderDue(at("2026-10-03T21:00:00"), "21:00", "2026-10-03")).toBe(false);
    expect(reminderDue(at("2026-10-03T21:00:00"), null, null)).toBe(false);
  });

  test("a computer that wakes up much later doesn't send a stale one", () => {
    expect(reminderDue(at("2026-10-04T01:00:00"), "21:00", null)).toBe(false);
  });

  test("a time after midnight belongs to the day before", () => {
    expect(reminderDue(at("2026-10-03T23:00:00"), "00:30", null)).toBe(false);
    expect(reminderDue(at("2026-10-04T00:45:00"), "00:30", null, "2026-10-03")).toBe(true);
  });
});

describe("checkReminder", () => {
  // A stand-in push service that records what it's sent.
  const received: Request[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      received.push(req.clone());
      return new Response(null, { status: 201 });
    },
  });
  afterAll(async () => {
    server.stop(true);
    await rm(dataDir, { recursive: true, force: true });
  });

  // A real browser makes these keys. Any valid P-256 key and 16 random bytes will do.
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const device = {
    endpoint: `http://127.0.0.1:${server.port}/push/abc`,
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") },
  };

  test("sends an encrypted reminder when nothing's printed, once", async () => {
    await Bun.write(join(dataDir, "settings.json"), JSON.stringify({ reminderTime: "21:00" }));
    await subscribe(device, "Mozilla/5.0 (iPhone)");
    await checkReminder(at("2026-10-03T21:01:00"));
    expect(received).toHaveLength(1);
    expect(received[0]!.headers.get("content-encoding")).toBe("aes128gcm");
    expect(received[0]!.headers.get("authorization")).toStartWith("vapid ");

    await checkReminder(at("2026-10-03T21:02:00"));
    expect(received).toHaveLength(1);
  });

  test("stays quiet once the day's been printed", async () => {
    await writeEntry({
      frontmatter: { date: "2026-10-04", volume: 1, issue: 1, headline: "Done", tags: [], people: [], events: [], sessions: [], pages: [], version: 1, created: "", updated: "" },
      markdown: "# Done\n",
    });
    await checkReminder(at("2026-10-04T21:01:00"));
    expect(received).toHaveLength(1);
  });

  test("forgets a device the push service says is gone", async () => {
    server.reload({ fetch: () => new Response(null, { status: 410 }) });
    await checkReminder(at("2026-10-05T21:01:00"));
    const saved = await Bun.file(join(dataDir, "push.json")).json();
    expect(saved.subscriptions).toEqual([]);
  });
});
