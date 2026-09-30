/**
 * Chat sessions: one conversation thread shared by every agent that answers in it
 * (one shared thread per session, rather than one global history).
 *
 * Saved as data/transcripts/<date>/<id>.json after every message, so the files are
 * always the source of truth. This is the only module that touches transcripts.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Session, type Msg } from "@daily-you/shared";
import { config } from "../config";
import { isoLocal } from "./dates";

const transcriptsDir = () => join(config.dataDir, "transcripts");
const pathFor = (s: Pick<Session, "id" | "date">) => join(transcriptsDir(), s.date, `${s.id}.json`);

// Session ids start with the date, so we can find the file without a lookup table.
const dateFromId = (id: string) => id.slice(0, 10);
const ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]{8}$/;

async function save(session: Session) {
  await Bun.write(pathFor(session), JSON.stringify(session, null, 2));
}

export async function createSession(date: string): Promise<Session> {
  const session: Session = {
    id: `${date}-${crypto.randomUUID().slice(0, 8)}`,
    date,
    created: isoLocal(),
    messages: [],
  };
  await save(session);
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  if (!ID_PATTERN.test(id)) return null;
  const file = Bun.file(pathFor({ id, date: dateFromId(id) }));
  if (!(await file.exists())) return null;
  return Session.parse(await file.json());
}

export async function addMessage(session: Session, msg: Msg, agent?: string): Promise<void> {
  session.messages.push({ ...msg, agent, at: isoLocal() });
  await save(session);
}

/** All sessions for a day, oldest first. */
export async function sessionsForDate(date: string): Promise<Session[]> {
  let files: string[];
  try {
    files = await readdir(join(transcriptsDir(), date));
  } catch {
    return [];
  }
  const sessions = await Promise.all(
    files.filter((f) => f.endsWith(".json")).map((f) => getSession(f.replace(/\.json$/, ""))),
  );
  return sessions.filter((s): s is Session => s !== null).sort((a, b) => a.created.localeCompare(b.created));
}

/** The {role, content} history an LLM call expects (drops agent/at). */
export function toHistory(session: Session): Msg[] {
  return session.messages.map(({ role, content }) => ({ role, content }));
}
