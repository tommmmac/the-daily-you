import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "daily-you-auth-"));
process.env.DATA_DIR = dataDir;
const { Hono } = await import("hono");
const { deviceName, isLocal, loginBlockedFor, recordFailure, resetFailures } = await import("../src/auth");
const { authRoutes, requireAuth } = await import("../src/routes/auth");

afterAll(() => rm(dataDir, { recursive: true, force: true }));

describe("isLocal", () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  test("a browser on this computer is local", () => {
    expect(isLocal(req("http://localhost:3000/api/entries"), "127.0.0.1")).toBe(true);
    expect(isLocal(req("http://127.0.0.1:3000/"), "::1")).toBe(true);
  });

  test("tailscale serve comes from 127.0.0.1 too, but adds forwarding headers", () => {
    const viaTailscale = req("http://localhost:3000/api/entries", {
      "x-forwarded-for": "100.101.102.103",
      "x-forwarded-proto": "https",
    });
    expect(isLocal(viaTailscale, "127.0.0.1")).toBe(false);
  });

  test("another address, or another host name, isn't local", () => {
    expect(isLocal(req("http://localhost:3000/"), "100.101.102.103")).toBe(false);
    expect(isLocal(req("http://my-pc.tail1234.ts.net/"), "127.0.0.1")).toBe(false);
  });
});

describe("routes", () => {
  // The same setup as index.ts, with `local` passed in like the server does.
  const app = new Hono<{ Bindings: { local: boolean } }>().basePath("/api");
  app.use(requireAuth);
  app.route("/", authRoutes);
  app.get("/entries", (c) => c.json([]));

  const call = (path: string, { local = false, cookie = "", method = "GET", body }: { local?: boolean; cookie?: string; method?: string; body?: unknown } = {}) =>
    app.fetch(
      new Request(`http://localhost${path}`, {
        method,
        headers: { "content-type": "application/json", cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { local },
    );
  const cookieFrom = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";

  test("the computer gets in without signing in, a phone doesn't", async () => {
    expect((await call("/api/entries", { local: true })).status).toBe(200);
    const res = await call("/api/entries");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  test("a phone can't sign in, or set the passphrase, before it's set on the computer", async () => {
    expect((await call("/api/auth/login", { method: "POST", body: { passphrase: "anything at all" } })).status).toBe(403);
    expect((await call("/api/auth/passphrase", { method: "PUT", body: { passphrase: "let me in please" } })).status).toBe(403);
  });

  test("passphrase set on the computer, then a phone signs in and stays in", async () => {
    expect((await call("/api/auth/passphrase", { local: true, method: "PUT", body: { passphrase: "short" } })).status).toBe(400);
    expect((await call("/api/auth/passphrase", { local: true, method: "PUT", body: { passphrase: "correct horse battery" } })).status).toBe(200);

    expect((await call("/api/auth/login", { method: "POST", body: { passphrase: "wrong one" } })).status).toBe(401);
    const login = await call("/api/auth/login", { method: "POST", body: { passphrase: "correct horse battery" } });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    const cookie = cookieFrom(login);

    expect((await call("/api/entries", { cookie })).status).toBe(200);
    const status = await (await call("/api/auth", { cookie })).json();
    expect(status).toMatchObject({ local: false, signedIn: true, passphraseSet: true });
    expect(status.devices).toEqual([expect.objectContaining({ device: "iPhone, Safari", current: true })]);

    // The token is only kept as a hash.
    expect(await Bun.file(join(dataDir, "auth.json")).text()).not.toContain(cookie.split("=")[1]!);

    await call("/api/auth/logout", { cookie, method: "POST" });
    expect((await call("/api/entries", { cookie })).status).toBe(401);
  });

  test("changing the passphrase, or signing out everywhere, signs every phone out", async () => {
    const signIn = async () => cookieFrom(await call("/api/auth/login", { method: "POST", body: { passphrase: "correct horse battery" } }));
    const a = await signIn();
    expect((await call("/api/auth/sessions", { cookie: a, method: "DELETE" })).status).toBe(403);
    await call("/api/auth/sessions", { local: true, method: "DELETE" });
    expect((await call("/api/entries", { cookie: a })).status).toBe(401);

    const b = await signIn();
    await call("/api/auth/passphrase", { local: true, method: "PUT", body: { passphrase: "a whole new one" } });
    expect((await call("/api/entries", { cookie: b })).status).toBe(401);
  });

  test("a made-up cookie gets nothing", async () => {
    expect((await call("/api/entries", { cookie: "dy_session=made-up" })).status).toBe(401);
  });
});

describe("wrong passphrases", () => {
  test("five in 15 minutes means waiting", () => {
    resetFailures();
    const t = Date.now();
    for (let i = 0; i < 4; i++) recordFailure(t);
    expect(loginBlockedFor(t)).toBe(0);
    recordFailure(t);
    expect(loginBlockedFor(t)).toBe(15);
    expect(loginBlockedFor(t + 15 * 60_000 + 1)).toBe(0);
    resetFailures();
  });
});

test("deviceName", () => {
  expect(deviceName("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe("Android, Chrome");
  expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Windows, Edge");
});
