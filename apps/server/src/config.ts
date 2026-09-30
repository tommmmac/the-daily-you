import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Bind to localhost only by default; phone access goes through Tailscale (Phase 5).
  hostname: process.env.HOST ?? "127.0.0.1",
  dataDir: resolve(process.env.DATA_DIR ?? resolve(repoRoot, "data")),
  ollamaHost: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  models: {
    router: process.env.MODEL_ROUTER ?? "qwen2.5:14b",
    reporter: process.env.MODEL_REPORTER ?? "qwen2.5:14b",
    copydesk: process.env.MODEL_COPYDESK ?? "qwen2.5:14b",
    embed: process.env.MODEL_EMBED ?? "nomic-embed-text",
  },
};
