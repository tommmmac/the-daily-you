/**
 * Open threads: things to follow up on, saved in data/threads.json.
 * Threads that are never answered stop showing up EXPIRE_DAYS after they're due,
 * so the Reporter doesn't keep asking about last month's exam.
 */
import { join } from "node:path";
import { Thread } from "@daily-you/shared";
import { config } from "../config";
import { addDays } from "./dates";

const threadsPath = () => join(config.dataDir, "threads.json");
export const EXPIRE_DAYS = 14;

export async function readThreads(): Promise<Thread[]> {
  const file = Bun.file(threadsPath());
  if (!(await file.exists())) return [];
  return Thread.array().parse(await file.json());
}

export async function writeThreads(threads: Thread[]): Promise<void> {
  await Bun.write(threadsPath(), JSON.stringify(threads, null, 2) + "\n");
}

/** Open and not expired, as of the diary day `today`. */
export const isLive = (t: Thread, today: string) => t.status === "open" && addDays(t.due, EXPIRE_DAYS) >= today;

/** Live threads that are due by `today`, soonest first: what the Reporter can ask about. */
export async function dueThreads(today: string): Promise<Thread[]> {
  return (await readThreads()).filter((t) => isLive(t, today) && t.due <= today).sort((a, b) => a.due.localeCompare(b.due));
}

export async function setThreadStatus(id: string, status: Thread["status"]): Promise<Thread | null> {
  const threads = await readThreads();
  const thread = threads.find((t) => t.id === id);
  if (!thread) return null;
  thread.status = status;
  await writeThreads(threads);
  return thread;
}
