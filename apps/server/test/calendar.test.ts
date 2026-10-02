import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Times below are Melbourne times, so make "local" Melbourne whatever machine runs this.
process.env.TZ = "Australia/Melbourne";
const dataDir = await mkdtemp(join(tmpdir(), "daily-you-calendar-"));
process.env.DATA_DIR = dataDir;
const { eventsOn, formatEvents, parseCalendar } = await import("../src/calendar/ics");
const { eventsFor, httpUrl } = await import("../src/calendar/feeds");
const { chatContext } = await import("../src/agents/_engine/run");

// Melbourne is UTC+10 until daylight saving starts on Sunday 4 October 2026, then UTC+11.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
X-WR-CALNAME:Uni
BEGIN:VTIMEZONE
TZID:Australia/Melbourne
BEGIN:STANDARD
DTSTART:19700405T030000
RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU
TZOFFSETFROM:+1100
TZOFFSETTO:+1000
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19701004T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU
TZOFFSETFROM:+1000
TZOFFSETTO:+1100
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:lecture
SUMMARY:FIT2004 Lecture
LOCATION:Clayton
DTSTART;TZID=Australia/Melbourne:20260901T100000
DTEND;TZID=Australia/Melbourne:20260901T120000
RRULE:FREQ=WEEKLY;UNTIL=20261130T000000Z
EXDATE;TZID=Australia/Melbourne:20260915T100000
END:VEVENT
BEGIN:VEVENT
UID:lecture
RECURRENCE-ID;TZID=Australia/Melbourne:20260922T100000
SUMMARY:FIT2004 Lecture (moved)
DTSTART;TZID=Australia/Melbourne:20260923T140000
DTEND;TZID=Australia/Melbourne:20260923T160000
END:VEVENT
BEGIN:VEVENT
UID:coffee
SUMMARY:Coffee with Priya
DTSTART:20260929T223000Z
DTEND:20260929T233000Z
END:VEVENT
BEGIN:VEVENT
UID:birthday
SUMMARY:Mum's birthday
DTSTART;VALUE=DATE:20260930
DTEND;VALUE=DATE:20261001
END:VEVENT
BEGIN:VEVENT
UID:trip
SUMMARY:Camping trip
DTSTART;VALUE=DATE:20261009
DTEND;VALUE=DATE:20261012
END:VEVENT
BEGIN:VEVENT
UID:cancelled
SUMMARY:Dentist
STATUS:CANCELLED
DTSTART;TZID=Australia/Melbourne:20260929T150000
DTEND;TZID=Australia/Melbourne:20260929T160000
END:VEVENT
BEGIN:VEVENT
UID:party
SUMMARY:Ben's party
DTSTART;TZID=Australia/Melbourne:20261009T200000
DTEND;TZID=Australia/Melbourne:20261010T020000
END:VEVENT
END:VCALENDAR
`.replace(/\n/g, "\r\n");

const calendar = parseCalendar(ICS);
const titles = (date: string) => eventsOn(calendar, date).map((e) => e.title);

describe("eventsOn", () => {
  test("knows the calendar's own name", () => {
    expect(calendar.name).toBe("Uni");
  });

  test("a weekly lecture shows up each week, in local time", () => {
    expect(eventsOn(calendar, "2026-09-08")).toEqual([
      { title: "FIT2004 Lecture", start: "2026-09-08T10:00:00+10:00", end: "2026-09-08T12:00:00+10:00", location: "Clayton" },
    ]);
    expect(titles("2026-09-09")).toEqual([]);
  });

  test("keeps the same local time after daylight saving starts", () => {
    expect(eventsOn(calendar, "2026-10-06")[0]?.start).toBe("2026-10-06T10:00:00+11:00");
  });

  test("skips a cancelled week and moves a changed one", () => {
    expect(titles("2026-09-15")).toEqual([]);
    expect(titles("2026-09-22")).toEqual([]);
    expect(eventsOn(calendar, "2026-09-23")[0]).toMatchObject({ title: "FIT2004 Lecture (moved)", start: "2026-09-23T14:00:00+10:00" });
  });

  test("stops when the series ends", () => {
    expect(titles("2026-11-24")).toEqual(["FIT2004 Lecture"]);
    expect(titles("2026-12-01")).toEqual([]);
  });

  test("UTC times land on the right local day", () => {
    // 22:30 UTC on the 29th is 8:30 am on the 30th in Melbourne.
    expect(titles("2026-09-29")).toEqual(["FIT2004 Lecture"]);
    expect(titles("2026-09-30")).toEqual(["Mum's birthday", "Coffee with Priya"]);
  });

  test("all-day events cover each of their days, and their end is exclusive", () => {
    expect(titles("2026-10-09")).toContain("Camping trip");
    expect(titles("2026-10-11")).toEqual(["Camping trip"]);
    expect(titles("2026-10-12")).toEqual([]);
    expect(eventsOn(calendar, "2026-10-10")[0]).toMatchObject({ start: "2026-10-09", end: "2026-10-12" });
  });

  test("leaves out cancelled events", () => {
    expect(titles("2026-09-29")).not.toContain("Dentist");
  });

  test("something that runs past midnight shows on both days", () => {
    expect(titles("2026-10-09")).toEqual(["Camping trip", "Ben's party"]);
    expect(titles("2026-10-10")).toEqual(["Camping trip", "Ben's party"]);
  });
});

describe("formatEvents", () => {
  test("gives plain times, and marks what hasn't happened yet", () => {
    const events = [...eventsOn(calendar, "2026-09-30"), { title: "Gym", start: "2026-09-30T18:00:00+10:00", calendar: "Me" }];
    const at = new Date("2026-09-30T12:00:00+10:00");
    expect(formatEvents(events, "2026-09-30", at)).toBe(
      ["- All day: Mum's birthday", "- 8:30 am to 9:30 am: Coffee with Priya", "- 6:00 pm: Gym [Me] (hasn't happened yet)"].join("\n"),
    );
  });

  test("says when something from the night before ends", () => {
    expect(formatEvents(eventsOn(calendar, "2026-10-10").slice(1), "2026-10-10", new Date("2026-10-11"))).toBe("- Until 2:00 am: Ben's party");
  });
});

describe("feeds", () => {
  let body = ICS;
  let status = 200;
  let hits = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      hits++;
      return new Response(body, { status });
    },
  });
  afterAll(async () => {
    server.stop(true);
    await rm(dataDir, { recursive: true, force: true });
  });
  const url = `http://localhost:${server.port}/basic.ics`;

  test("webcal links are fetched over https", () => {
    expect(httpUrl("webcal://p01-caldav.icloud.com/x.ics")).toBe("https://p01-caldav.icloud.com/x.ics");
  });

  test("tags events with the calendar's name, skips switched-off ones, and caches", async () => {
    const feeds = [
      { name: "Uni", url, enabled: true },
      { name: "Old", url: `${url}?old`, enabled: false },
    ];
    const first = await eventsFor("2026-09-30", feeds);
    expect(first.failed).toEqual([]);
    expect(first.events.map((e) => [e.title, e.calendar])).toEqual([
      ["Mum's birthday", "Uni"],
      ["Coffee with Priya", "Uni"],
    ]);
    await eventsFor("2026-10-01", feeds);
    expect(hits).toBe(1);
  });

  test("a link that has never worked is named in failed", async () => {
    status = 404;
    const { events, failed } = await eventsFor("2026-09-30", [{ name: "Broken", url: `${url}?broken`, enabled: true }]);
    expect(events).toEqual([]);
    expect(failed).toEqual(["Broken"]);
    status = 200;
  });

  test("something that isn't a calendar is turned away", async () => {
    body = "<html>Sign in</html>";
    expect((await eventsFor("2026-09-30", [{ name: "Page", url: `${url}?page`, enabled: true }])).failed).toEqual(["Page"]);
    body = ICS;
  });

  test("the Reporter gets the day's events, or is told there's no calendar", async () => {
    expect((await chatContext("2026-09-30")).events).toBe("No calendar connected.");

    await Bun.write(join(dataDir, "settings.json"), JSON.stringify({ calendars: [{ name: "Uni", url, enabled: true }] }));
    const ctx = await chatContext("2026-09-30");
    expect(ctx.events).toContain("- All day: Mum's birthday [Uni]");
    expect(ctx.events).toContain("Coffee with Priya");
    expect((await chatContext("2026-09-28")).events).toBe("Nothing on their calendar.");
  });
});
