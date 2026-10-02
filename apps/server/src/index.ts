import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Health } from "@daily-you/shared";
import { AGENTS } from "./agents/_engine/registry";
import { config } from "./config";
import { listModels } from "./llm/ollama";
import { queueSync } from "./morgue";
import { chatRoutes } from "./routes/chat";
import { entryRoutes } from "./routes/entries";
import { memoryRoutes } from "./routes/memory";
import { apiError } from "./routes/errors";
import { settingsRoutes } from "./routes/settings";
import { ensureDataDir } from "./store/data-dir";
import { onEntryChange } from "./store/entries";
import pkg from "../package.json";

await ensureDataDir();

// Keep The Morgue's index in step with the entries: catch up now, then after every change.
onEntryChange((date) => void queueSync(date));
void queueSync();

const app = new Hono().basePath("/api");
app.use(logger());

app.get("/health", async (c) => {
  const models = await listModels();
  const body: Health = {
    ok: true,
    version: pkg.version ?? "0.0.0",
    ollama: { up: models !== null, host: config.ollamaHost, models: models ?? [] },
  };
  return c.json(body);
});

app.route("/", chatRoutes);
app.route("/", entryRoutes);
app.route("/", memoryRoutes);
app.route("/", settingsRoutes);

app.notFound((c) => apiError(c, 404, "not_found", `No route ${c.req.path}`));
app.onError((err, c) => {
  console.error(err);
  return apiError(c, 500, "invalid_request", "Internal server error");
});

console.log(`The Daily You server on http://${config.hostname}:${config.port}`);
console.log(`Data folder: ${config.dataDir}`);
console.log(`Agents: ${Object.values(AGENTS).map((a) => `${a.name}${a.routable ? "" : " (button only)"}`).join(", ")}`);

export default {
  port: config.port,
  hostname: config.hostname,
  fetch: app.fetch,
  // Printing on a local model can take a while, especially while it loads.
  idleTimeout: 255,
};
