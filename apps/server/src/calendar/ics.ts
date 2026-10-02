/**
 * Reading ICS (iCalendar) files: which events happen on a given day. Uses ical.js for
 * parsing, time zones and recurring events ("every Tuesday until December"), which are
 * too fiddly to get right by hand. No network here, see feeds.ts for that.
 */
import ICAL from "ical.js";
import type { CalendarEvent } from "@daily-you/shared";
import { addDays, isoLocal } from "../store/dates";

/** A parsed ICS file, ready to ask about any day. */
export type Calendar = {
  /** The name the calendar gives itself (X-WR-CALNAME), if any. */
  name: string | null;
  /** One-off events, and moved or changed occurrences of recurring ones. */
  single: ICAL.Event[];
  recurring: ICAL.Event[];
};

// A daily event from years back is a few thousand steps to reach today; stop well after that.
const MAX_STEPS = 20_000;
const MAX_TITLE = 120;

export function parseCalendar(text: string): Calendar {
  const root = new ICAL.Component(ICAL.parse(text));
  // Time zones the file defines, so "10am Australia/Melbourne" lands at the right moment.
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

  const vevents = root.getAllSubcomponents("vevent").filter((v) => String(v.getFirstPropertyValue("status") ?? "").toUpperCase() !== "CANCELLED");
  const masters = new Map<string, ICAL.Event>();
  const single: ICAL.Event[] = [];
  const recurring: ICAL.Event[] = [];
  for (const v of vevents) {
    if (v.hasProperty("recurrence-id")) continue;
    const event = new ICAL.Event(v);
    if (event.isRecurring()) {
      recurring.push(event);
      masters.set(event.uid, event);
    } else {
      single.push(event);
    }
  }
  // A changed occurrence ("this week's lecture is in a different room") is its own VEVENT.
  // Tell the series about it so it skips that slot, then treat it like a one-off.
  for (const v of vevents) {
    if (!v.hasProperty("recurrence-id")) continue;
    const exception = new ICAL.Event(v);
    masters.get(exception.uid)?.relateException(exception);
    single.push(exception);
  }

  const name = root.getFirstPropertyValue("x-wr-calname");
  return { name: typeof name === "string" && name.trim() ? name.trim() : null, single, recurring };
}

/** Events that happen on `date` (YYYY-MM-DD, local time), all-day ones first, then by start. */
export function eventsOn(calendar: Calendar, date: string): CalendarEvent[] {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${addDays(date, 1)}T00:00:00`);
  const found: CalendarEvent[] = [];

  const consider = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    const event = toEvent(item, start, end, date, dayStart, dayEnd);
    if (event) found.push(event);
  };

  for (const event of calendar.single) consider(event, event.startDate, event.endDate);
  for (const series of calendar.recurring) {
    const it = series.iterator();
    for (let step = 0, next = it.next(); next && step < MAX_STEPS; step++, next = it.next()) {
      if (next.toJSDate() >= dayEnd) break;
      const occurrence = series.getOccurrenceDetails(next);
      // Changed occurrences are already in `single`, at their new time.
      if (occurrence.item !== series) continue;
      consider(series, occurrence.startDate, occurrence.endDate);
    }
  }

  return found.sort(byStart);
}

const isAllDay = (e: CalendarEvent) => e.start.length === 10;

/** All-day events first, then by start time. */
export const byStart = (a: CalendarEvent, b: CalendarEvent) =>
  Number(isAllDay(b)) - Number(isAllDay(a)) || a.start.localeCompare(b.start);

/**
 * One line per event for the Reporter's prompt, with times worked out here (models are bad
 * at reading timestamps). Anything that starts after `now` is marked, so it's asked about as a plan.
 */
export function formatEvents(events: CalendarEvent[], date: string, now = new Date()): string {
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  return events
    .map((e) => {
      let when: string;
      if (isAllDay(e)) when = "All day";
      else if (!e.start.startsWith(date)) when = e.end ? `Until ${time(e.end)}` : time(e.start);
      else when = e.end ? `${time(e.start)} to ${time(e.end)}` : time(e.start);
      const where = e.location ? `, at ${e.location}` : "";
      const from = e.calendar ? ` [${e.calendar}]` : "";
      const later = !isAllDay(e) && new Date(e.start) > now ? " (hasn't happened yet)" : "";
      return `- ${when}: ${e.title}${where}${from}${later}`;
    })
    .join("\n");
}

/** The event as saved, if it overlaps the day at all. */
function toEvent(item: ICAL.Event, start: ICAL.Time, end: ICAL.Time | null, date: string, dayStart: Date, dayEnd: Date): CalendarEvent | null {
  const title = (item.summary || "(No title)").trim().slice(0, MAX_TITLE);
  const location = item.location?.trim() || undefined;

  if (start.isDate) {
    // All-day: dates, with the end exclusive. No end means a single day.
    const from = start.toString();
    const to = end && end.compare(start) > 0 ? end.toString() : addDays(from, 1);
    if (!(from <= date && date < to)) return null;
    return { title, start: from, end: to, location };
  }

  const startAt = start.toJSDate();
  const endAt = end && end.compare(start) > 0 ? end.toJSDate() : startAt;
  // A zero-length event (a reminder at midnight) still counts if it starts on the day.
  const overlaps = startAt < dayEnd && (endAt > dayStart || startAt >= dayStart);
  if (!overlaps) return null;
  return { title, start: isoLocal(startAt), end: endAt > startAt ? isoLocal(endAt) : undefined, location };
}
