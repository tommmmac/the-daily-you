/**
 * Signing in from other devices. The computer the server runs on is always let in: anyone
 * at it can read data/ anyway. Anything else (a phone through `tailscale serve`) needs a
 * session cookie, which it gets by typing the passphrase set on the computer.
 *
 * Saved in data/auth.json: the passphrase's hash and a hash of each session token, so the
 * file alone can't sign anyone in.
 */
import { join } from "node:path";
import type { AuthDevice } from "@daily-you/shared";
import { config } from "./config";
import { isoLocal } from "./store/dates";

type Session = { id: string; device: string; created: string; lastSeen: string };
type AuthFile = { hash: string | null; sessions: Session[] };

export const COOKIE = "dy_session";
export const SESSION_DAYS = 365;
// Only touch the file once an hour per session, not on every request.
const SEEN_EVERY_MS = 60 * 60_000;

const pathFor = () => join(config.dataDir, "auth.json");
let cache: { dir: string; file: AuthFile } | null = null;

async function load(): Promise<AuthFile> {
  if (cache?.dir === config.dataDir) return cache.file;
  const f = Bun.file(pathFor());
  const file: AuthFile = (await f.exists()) ? await f.json() : { hash: null, sessions: [] };
  cache = { dir: config.dataDir, file };
  return file;
}

async function save(file: AuthFile) {
  cache = { dir: config.dataDir, file };
  await Bun.write(pathFor(), JSON.stringify(file, null, 2));
}

const sha256 = (token: string) => new Bun.CryptoHasher("sha256").update(token).digest("hex");

/**
 * True if the request comes from this computer and not through a proxy. `tailscale serve`
 * connects from 127.0.0.1 too, but it always adds X-Forwarded-For, so anything with
 * forwarding headers counts as another device.
 */
export function isLocal(req: Request, ip: string | undefined): boolean {
  const loopback = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  const proxied = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "forwarded", "tailscale-user-login"].some((h) =>
    req.headers.has(h),
  );
  const host = new URL(req.url).hostname;
  const localHost = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  return loopback && !proxied && localHost;
}

export const passphraseSet = async () => (await load()).hash !== null;

/** Sets (or changes) the passphrase, and signs every device out. */
export async function setPassphrase(passphrase: string) {
  await save({ hash: await Bun.password.hash(passphrase), sessions: [] });
}

/** Turns phone access off: no passphrase, nobody signed in. */
export async function clearPassphrase() {
  await save({ hash: null, sessions: [] });
}

export async function checkPassphrase(passphrase: string): Promise<boolean> {
  const { hash } = await load();
  return hash !== null && (await Bun.password.verify(passphrase, hash));
}

/** A new session for `userAgent`. Returns the token for the cookie. */
export async function createSession(userAgent: string): Promise<string> {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const file = await load();
  const now = isoLocal();
  file.sessions.push({ id: sha256(token), device: deviceName(userAgent), created: now, lastSeen: now });
  await save(file);
  return token;
}

/** The session for this token, if it's real and not expired. */
export async function findSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const file = await load();
  const id = sha256(token);
  const session = file.sessions.find((s) => s.id === id);
  if (!session) return null;
  if (Date.now() - new Date(session.lastSeen).getTime() > SESSION_DAYS * 86_400_000) return null;
  if (Date.now() - new Date(session.lastSeen).getTime() > SEEN_EVERY_MS) {
    session.lastSeen = isoLocal();
    await save(file);
  }
  return session;
}

export async function endSession(token: string | undefined) {
  if (!token) return;
  const file = await load();
  const id = sha256(token);
  file.sessions = file.sessions.filter((s) => s.id !== id);
  await save(file);
}

export async function endAllSessions() {
  const file = await load();
  file.sessions = [];
  await save(file);
}

export async function listDevices(currentToken: string | undefined): Promise<AuthDevice[]> {
  const current = currentToken ? sha256(currentToken) : null;
  return (await load()).sessions.map((s) => ({
    id: s.id.slice(0, 8),
    device: s.device,
    created: s.created,
    lastSeen: s.lastSeen,
    current: s.id === current,
  }));
}

/** "iPhone", "Android", "Windows"... Good enough to tell your devices apart. */
export function deviceName(ua: string): string {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${os}, ${browser}` : os;
}

/**
 * Wrong passphrases: after 5 in 15 minutes, wait before trying again. Counted for everyone
 * together, since every phone comes through tailscale serve from the same address.
 */
const failures: number[] = [];
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;

export function loginBlockedFor(now = Date.now()): number {
  while (failures.length && now - failures[0]! > WINDOW_MS) failures.shift();
  return failures.length >= MAX_FAILURES ? Math.ceil((failures[0]! + WINDOW_MS - now) / 60_000) : 0;
}

export function recordFailure(now = Date.now()) {
  failures.push(now);
}

export function resetFailures() {
  failures.length = 0;
}
