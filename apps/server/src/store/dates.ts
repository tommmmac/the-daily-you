import { config } from "../config";

/**
 * The diary day for a moment in time, as YYYY-MM-DD in local time.
 * Before the cutoff hour (default 4am) it still counts as the previous day.
 */
export function diaryDate(now = new Date(), cutoffHour = config.dayCutoffHour): string {
  const d = new Date(now);
  if (d.getHours() < cutoffHour) d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA"); // en-CA formats as YYYY-MM-DD
}

/** Weekday name for a YYYY-MM-DD date, e.g. "Wednesday". */
export function weekdayOf(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", { weekday: "long" });
}

/** Local time with offset, e.g. 2026-09-30T21:14:03+10:00 */
export function isoLocal(d = new Date()): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.toLocaleDateString("en-CA")}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`
  );
}
