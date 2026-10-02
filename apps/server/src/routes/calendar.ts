import { Hono } from "hono";
import { CalendarTestRequest, type CalendarDay, type CalendarTest } from "@daily-you/shared";
import { CalendarFetchError, eventsFor, fetchCalendar } from "../calendar/feeds";
import { eventsOn } from "../calendar/ics";
import { diaryDate } from "../store/dates";
import { apiError } from "./errors";

export const calendarRoutes = new Hono();

// Today's events from every enabled calendar.
calendarRoutes.get("/calendar/today", async (c) => {
  const date = diaryDate();
  return c.json<CalendarDay>({ date, ...(await eventsFor(date)) });
});

// Check a link before saving it: its name and today's events, or why it didn't work.
calendarRoutes.post("/calendar/test", async (c) => {
  const body = CalendarTestRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.issues[0]?.message ?? "Invalid link");
  try {
    const calendar = await fetchCalendar(body.data.url);
    return c.json<CalendarTest>({ name: calendar.name, events: eventsOn(calendar, diaryDate()) });
  } catch (e) {
    if (e instanceof CalendarFetchError) return apiError(c, 502, "calendar_unavailable", `Couldn't read that calendar: ${e.message}.`);
    throw e;
  }
});
