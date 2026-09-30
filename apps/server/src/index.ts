import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Health } from "@daily-you/shared";
import { config } from "./config";
import { listModels } from "./llm/ollama";
import { ensureDataDir } from "./store/data-dir";
import pkg from "../package.json";

await ensureDataDir();

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

app.notFound((c) => c.json({ error: { code: "not_found", message: `No route ${c.req.path}` } }, 404));

console.log(`The Daily You server on http://${config.hostname}:${config.port}`);
console.log(`Data folder: ${config.dataDir}`);

export default {
  port: config.port,
  hostname: config.hostname,
  fetch: app.fetch,
};
