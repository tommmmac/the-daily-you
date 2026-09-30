import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Bind to localhost only by default; phone access goes through Tailscale (Phase 5).
  hostname: process.env.HOST ?? "127.0.0.1",
  // Read on each use so tests can point it at a temp folder.
  get dataDir() {
    return resolve(process.env.DATA_DIR ?? resolve(repoRoot, "data"));
  },
  ollamaHost: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  /** Keep the model loaded between messages so replies stay fast. */
  keepAlive: process.env.OLLAMA_KEEP_ALIVE ?? "30m",
  models: {
    router: process.env.MODEL_ROUTER ?? "qwen2.5:14b",
    reporter: process.env.MODEL_REPORTER ?? "qwen2.5:14b",
    copydesk: process.env.MODEL_COPYDESK ?? "qwen2.5:14b",
    embed: process.env.MODEL_EMBED ?? "nomic-embed-text",
  },
  /** Used in prompts. Optional. */
  userName: process.env.USER_NAME ?? "",
  /** Printed before each story, e.g. "MELBOURNE". */
  dateline: process.env.DATELINE ?? "HOME",
  /** Chats before this hour count as the previous day. */
  dayCutoffHour: Number(process.env.DAY_CUTOFF_HOUR ?? 4),
};

export type ModelRole = keyof typeof config.models;
