/**
 * Calendar links from Settings: fetched, parsed and cached, so a chat turn doesn't wait
 * on Google every time. A link that fails keeps its last good copy; one that has never
 * worked is left out and named in `failed`.
 *
 * The links are private ("secret address"), so they're never logged. Errors say the calendar's name.
 */
import type { CalendarEvent, CalendarFeed } from "@daily-you/shared";
import { config } from "../config";
import { byStart, eventsOn, parseCalendar, type Calendar } from "./ics";

// How long a fetched calendar is used before fetching again.
const FRESH_MS = 15 * 60_000;
const TIMEOUT_MS = 8_000;
// A year of a busy calendar is well under this.
const MAX_BYTES = 20 * 1024 * 1024;

const cache = new Map<string, { at: number; calendar: Calendar }>();

/** webcal:// is just https:// for calendar apps. */
export const httpUrl = (url: string) => url.trim().replace(/^webcal:\/\//i, "https://");

export class CalendarFetchError extends Error {}

/** Download and parse one link. Throws CalendarFetchError with a reason that's fine to show. */
export async function fetchCalendar(url: string): Promise<Calendar> {
  let res: Response;
  try {
    res = await fetch(httpUrl(url), { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "text/calendar" } });
  } catch (e) {
    throw new CalendarFetchError(e instanceof Error && e.name === "TimeoutError" ? "it took too long to answer" : "couldn't connect");
  }
  if (!res.ok) throw new CalendarFetchError(res.status === 404 ? "the link wasn't found (404)" : `the server said ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new CalendarFetchError("the calendar is too big");
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) throw new CalendarFetchError("that link isn't an iCal (.ics) calendar");
  try {
    return parseCalendar(text);
  } catch {
    throw new CalendarFetchError("the calendar couldn't be read");
  }
}

async function load(feed: CalendarFeed): Promise<Calendar> {
  const cached = cache.get(feed.url);
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.calendar;
  try {
    const calendar = await fetchCalendar(feed.url);
    cache.set(feed.url, { at: Date.now(), calendar });
    return calendar;
  } catch (e) {
    if (!cached) throw e;
    console.warn(`Calendar "${feed.name}": ${(e as Error).message}, using the copy from ${new Date(cached.at).toLocaleTimeString()}`);
    return cached.calendar;
  }
}

/** Events on `date` from every enabled calendar, and the names of any that couldn't be read. */
export async function eventsFor(date: string, feeds = config.calendars): Promise<{ events: CalendarEvent[]; failed: string[] }> {
  const enabled = feeds.filter((f) => f.enabled);
  const results = await Promise.allSettled(enabled.map(load));
  const events: CalendarEvent[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    const feed = enabled[i]!;
    if (r.status === "fulfilled") {
      events.push(...eventsOn(r.value, date).map((e) => ({ ...e, calendar: feed.name })));
    } else {
      console.warn(`Calendar "${feed.name}" couldn't be read: ${(r.reason as Error).message}`);
      failed.push(feed.name);
    }
  });
  return { events: events.sort(byStart), failed };
}

/** True if any calendar is switched on, so there's something to look at. */
export const hasCalendars = () => config.calendars.some((f) => f.enabled);
