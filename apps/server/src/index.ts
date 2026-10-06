import type { Server } from "bun";
import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Health } from "@daily-you/shared";
import { AGENTS } from "./agents/_engine/registry";
import { isLocal } from "./auth";
import { config } from "./config";
import { listModels } from "./llm/ollama";
import { queueSync } from "./morgue";
import { startReminders } from "./push";
import { authRoutes, requireAuth, type AppEnv } from "./routes/auth";
import { calendarRoutes } from "./routes/calendar";
import { chatRoutes } from "./routes/chat";
import { entryRoutes } from "./routes/entries";
import { memoryRoutes } from "./routes/memory";
import { pushRoutes } from "./routes/push";
import { apiError } from "./routes/errors";
import { settingsRoutes } from "./routes/settings";
import { ensureDataDir } from "./store/data-dir";
import { onEntryChange } from "./store/entries";
import { hasWebBuild, serveWeb } from "./web";
import pkg from "../package.json";

await ensureDataDir();

// Keep The Morgue's index in step with the entries: catch up now, then after every change.
onEntryChange((date) => void queueSync(date));
void queueSync();
startReminders();

const app = new Hono<AppEnv>().basePath("/api");
app.use(logger());
app.use(requireAuth);

app.get("/health", async (c) => {
  const models = await listModels();
  const body: Health = {
    ok: true,
    version: pkg.version ?? "0.0.0",
    ollama: { up: models !== null, host: config.ollamaHost, models: models ?? [] },
  };
  return c.json(body);
});

app.route("/", authRoutes);
app.route("/", calendarRoutes);
app.route("/", chatRoutes);
app.route("/", entryRoutes);
app.route("/", memoryRoutes);
app.route("/", pushRoutes);
app.route("/", settingsRoutes);

app.notFound((c) => apiError(c, 404, "not_found", `No route ${c.req.path}`));
app.onError((err, c) => {
  console.error(err);
  return apiError(c, 500, "invalid_request", "Internal server error");
});

const webBuilt = await hasWebBuild();
const url = `http://${config.hostname === "127.0.0.1" ? "localhost" : config.hostname}:${config.port}`;
console.log(webBuilt ? `The Daily You is on ${url}` : `The Daily You server on ${url} (API only, no web build)`);
console.log(`Data folder: ${config.dataDir}`);
console.log(`Agents: ${Object.values(AGENTS).map((a) => `${a.name}${a.routable ? "" : " (button only)"}`).join(", ")}`);

export default {
  port: config.port,
  hostname: config.hostname,
  // /api/* is the API. Everything else is the web app, if it's been built.
  async fetch(req: Request, server: Server<undefined>) {
    const { pathname } = new URL(req.url);
    const local = isLocal(req, server.requestIP(req)?.address);
    if (pathname === "/api" || pathname.startsWith("/api/") || !webBuilt) return app.fetch(req, { local });
    return (await serveWeb(pathname)) ?? new Response("Not found", { status: 404 });
  },
  // Printing on a local model can take a while, especially while it loads.
  idleTimeout: 255,
};
