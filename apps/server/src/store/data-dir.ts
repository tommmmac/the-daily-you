import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config";

// See docs/ARCHITECTURE.md#storage
const folders = ["entries", "versions", "transcripts", "media"];

export async function ensureDataDir() {
  for (const f of folders) await mkdir(join(config.dataDir, f), { recursive: true });
}
