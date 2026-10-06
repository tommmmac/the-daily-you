/**
 * The nightly reminder: a push notification at the time set in Settings, if nothing's been
 * printed yet that day. Sent to every device that turned reminders on (phone or PC).
 *
 * Push goes through the browser's own service (Google's for Chrome, Apple's for Safari).
 * They only see an encrypted blob, and the message is just "nothing printed yet".
 * Saved in data/push.json: this server's keys and each device's subscription.
 */
import { join } from "node:path";
import webpush from "web-push";
import type { PushSubscriptionInfo } from "@daily-you/shared";
import { config } from "./config";
import { deviceName } from "./auth";
import { diaryDate, isoLocal } from "./store/dates";
import { readEntry } from "./store/entries";

type Subscription = PushSubscriptionInfo & { device: string; created: string };
type PushFile = {
  vapid: { publicKey: string; privateKey: string };
  subscriptions: Subscription[];
  /** The diary day the last reminder was for, so it's sent once a day. */
  lastSent: string | null;
};

// If the computer wakes up after the reminder time, still remind for this long after it.
const LATE_MINUTES = 3 * 60;
const CHECK_EVERY_MS = 60_000;

const pathFor = () => join(config.dataDir, "push.json");
let cache: { dir: string; file: PushFile } | null = null;

async function load(): Promise<PushFile> {
  if (cache?.dir === config.dataDir) return cache.file;
  const f = Bun.file(pathFor());
  const file: PushFile = (await f.exists())
    ? await f.json()
    : { vapid: webpush.generateVAPIDKeys(), subscriptions: [], lastSent: null };
  cache = { dir: config.dataDir, file };
  if (!(await f.exists())) await save(file);
  return file;
}

async function save(file: PushFile) {
  cache = { dir: config.dataDir, file };
  await Bun.write(pathFor(), JSON.stringify(file, null, 2));
}

export const publicKey = async () => (await load()).vapid.publicKey;

export async function subscribe(sub: PushSubscriptionInfo, userAgent: string) {
  const file = await load();
  file.subscriptions = file.subscriptions.filter((s) => s.endpoint !== sub.endpoint);
  file.subscriptions.push({ ...sub, device: deviceName(userAgent), created: isoLocal() });
  await save(file);
}

export async function unsubscribe(endpoint: string) {
  const file = await load();
  file.subscriptions = file.subscriptions.filter((s) => s.endpoint !== endpoint);
  await save(file);
}

export type Message = { title: string; body: string; url?: string };

/** Send to the given devices (all of them by default). Ones the browser has dropped are forgotten. */
export async function send(message: Message, only?: string): Promise<number> {
  const file = await load();
  const targets = file.subscriptions.filter((s) => !only || s.endpoint === only);
  const options = { vapidDetails: { subject: "https://github.com/tommmmac/the-daily-you", ...file.vapid }, TTL: 6 * 60 * 60 };
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    targets.map(async (s) => {
      // web-push does the encryption and signing; the request itself is a plain fetch.
      const { endpoint, method, headers, body } = webpush.generateRequestDetails(s, JSON.stringify(message), options);
      const res = await fetch(endpoint, { method, headers, body: new Uint8Array(body), signal: AbortSignal.timeout(10_000) }).catch((e: Error) => e);
      if (res instanceof Error) console.warn(`Couldn't send a reminder to ${s.device}: ${res.message}`);
      else if (res.ok) sent++;
      // 404/410: the browser unsubscribed (app uninstalled, notifications turned off).
      else if (res.status === 404 || res.status === 410) gone.push(s.endpoint);
      else console.warn(`Couldn't send a reminder to ${s.device}: the push service said ${res.status}`);
    }),
  );
  if (gone.length) {
    file.subscriptions = file.subscriptions.filter((s) => !gone.includes(s.endpoint));
    await save(file);
  }
  return sent;
}

/** Minutes since midnight for "21:00". */
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Whether it's time for today's reminder: past the time (but not hours past), and not sent yet. */
export function reminderDue(now: Date, time: string | null, lastSent: string | null, date = diaryDate(now)): boolean {
  if (!time || lastSent === date) return false;
  // Late-night times (after midnight, before the day cutoff) belong to the day before.
  let minutes = now.getHours() * 60 + now.getMinutes();
  if (date !== isoLocal(now).slice(0, 10)) minutes += 24 * 60;
  let target = minutesOf(time);
  if (target < config.dayCutoffHour * 60) target += 24 * 60;
  return minutes >= target && minutes - target <= LATE_MINUTES;
}

export async function reminderMessage(): Promise<Message> {
  const name = config.userName.trim().split(/\s+/)[0];
  return {
    title: config.paperName,
    body: name ? `Nothing in the paper yet today, ${name}. Got five minutes?` : "Nothing in the paper yet today. Got five minutes?",
    url: "/chat",
  };
}

/** Runs once a minute. Sends the reminder when it's due and today has no entry yet. */
export async function checkReminder(now = new Date()) {
  const date = diaryDate(now);
  const file = await load();
  if (!file.subscriptions.length || !reminderDue(now, config.reminderTime, file.lastSent, date)) return;
  file.lastSent = date;
  await save(file);
  if (await readEntry(date)) return;
  const sent = await send(await reminderMessage());
  console.log(`Sent the reminder for ${date} to ${sent} device${sent === 1 ? "" : "s"}.`);
}

export function startReminders() {
  const tick = () => void checkReminder().catch((e) => console.warn("Reminder check failed:", e));
  setInterval(tick, CHECK_EVERY_MS);
  tick();
}
