import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { LoginRequest, PassphraseRequest, type AuthStatus } from "@daily-you/shared";
import {
  checkPassphrase,
  clearPassphrase,
  COOKIE,
  createSession,
  endAllSessions,
  endSession,
  findSession,
  listDevices,
  loginBlockedFor,
  passphraseSet,
  recordFailure,
  resetFailures,
  SESSION_DAYS,
  setPassphrase,
} from "../auth";
import { apiError } from "./errors";

/** `local` is worked out from the connection in index.ts. */
export type AppEnv = { Bindings: { local: boolean } };

export const authRoutes = new Hono<AppEnv>();

const signedIn = async (c: Parameters<MiddlewareHandler<AppEnv>>[0]) =>
  c.env.local || (await findSession(getCookie(c, COOKIE))) !== null;

/** Everything under /api except /api/auth needs this computer or a signed-in device. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.path === "/api/auth" || c.req.path.startsWith("/api/auth/") || (await signedIn(c))) return next();
  return apiError(c, 401, "unauthorized", "Sign in first.");
};

authRoutes.get("/auth", async (c) => {
  const ok = await signedIn(c);
  return c.json<AuthStatus>({
    local: c.env.local,
    signedIn: ok,
    passphraseSet: await passphraseSet(),
    devices: ok ? await listDevices(getCookie(c, COOKIE)) : [],
  });
});

authRoutes.post("/auth/login", async (c) => {
  const wait = loginBlockedFor();
  if (wait) return apiError(c, 429, "too_many_attempts", `Too many wrong tries. Try again in ${wait} minute${wait === 1 ? "" : "s"}.`);
  const body = LoginRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", "Type the passphrase.");
  if (!(await passphraseSet())) return apiError(c, 403, "forbidden", "Set a passphrase on your computer first, in Settings.");
  if (!(await checkPassphrase(body.data.passphrase))) {
    recordFailure();
    return apiError(c, 401, "unauthorized", "That's not the passphrase.");
  }
  resetFailures();
  const token = await createSession(c.req.header("user-agent") ?? "");
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
    // tailscale serve is https, and says so.
    secure: c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:",
  });
  return c.json({ ok: true });
});

authRoutes.post("/auth/logout", async (c) => {
  await endSession(getCookie(c, COOKIE));
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// The rest change who can get in, so only this computer can do them.
const localOnly: MiddlewareHandler<AppEnv> = async (c, next) =>
  c.env.local ? next() : apiError(c, 403, "forbidden", "That can only be done on the computer the diary runs on.");

authRoutes.put("/auth/passphrase", localOnly, async (c) => {
  const body = PassphraseRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.issues[0]?.message ?? "Invalid passphrase");
  await setPassphrase(body.data.passphrase);
  return c.json({ ok: true });
});

authRoutes.delete("/auth/passphrase", localOnly, async (c) => {
  await clearPassphrase();
  return c.json({ ok: true });
});

authRoutes.delete("/auth/sessions", localOnly, async (c) => {
  await endAllSessions();
  return c.json({ ok: true });
});
