import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { SettingsPatch } from "@daily-you/shared";

const repoRoot = resolve(import.meta.dir, "../../..");

let cache: { key: string; value: SettingsPatch } | null = null;

/**
 * Settings saved from the Settings page (data/settings.json). Re-read whenever the file
 * changes, so edits by hand or `bun run wipe` apply without a restart.
 */
function saved(): SettingsPatch {
  const path = resolve(config.dataDir, "settings.json");
  try {
    const { mtimeMs, size } = statSync(path);
    const key = `${path}:${mtimeMs}:${size}`;
    if (cache?.key === key) return cache.value;
    const value = SettingsPatch.parse(JSON.parse(readFileSync(path, "utf8")));
    cache = { key, value };
    return value;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`Ignoring unreadable ${path}:`, e);
    return {};
  }
}

// Saved settings win, then .env, then the defaults.
const DEFAULT_MODEL = "qwen2.5:14b";

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
    get router() {
      return saved().models?.router ?? (process.env.MODEL_ROUTER || DEFAULT_MODEL);
    },
    get reporter() {
      return saved().models?.reporter ?? (process.env.MODEL_REPORTER || DEFAULT_MODEL);
    },
    get copydesk() {
      return saved().models?.copydesk ?? (process.env.MODEL_COPYDESK || DEFAULT_MODEL);
    },
    embed: process.env.MODEL_EMBED ?? "nomic-embed-text",
  },
  /** Used in prompts. Optional. */
  get userName() {
    return saved().name ?? process.env.USER_NAME ?? "";
  },
  /** Shown in the masthead. */
  get paperName() {
    return saved().paperName ?? (process.env.PAPER_NAME || "The Daily You");
  },
  /** Printed before each story, e.g. "MELBOURNE". */
  get dateline() {
    return saved().dateline ?? (process.env.DATELINE || "HOME");
  },
  /** Chats before this hour count as the previous day. */
  get dayCutoffHour() {
    return saved().dayCutoffHour ?? Number(process.env.DAY_CUTOFF_HOUR || 4);
  },
  /** What the Reporter chats in and the paper is written in. */
  get language() {
    return saved().language ?? (process.env.PAPER_LANGUAGE || "English");
  },
  /** How the paper refers to the diarist. "" means not set, so it stays gender-neutral. */
  get pronouns() {
    return saved().pronouns ?? process.env.PRONOUNS ?? "";
  },
  /** ICS links from the Settings page. Only saved there, since the links are private. */
  get calendars() {
    return saved().calendars ?? [];
  },
};

export type ModelRole = keyof typeof config.models;
