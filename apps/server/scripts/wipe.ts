/**
 * Delete everything in the data folder: entries, versions, transcripts, the lot.
 * For testing. Run from the repo root with `bun run wipe` (asks first) or `bun run wipe --yes`.
 */
import { readdir, rm } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { config } from "../src/config";
import { ensureDataDir } from "../src/store/data-dir";

const dir = config.dataDir;
const repoRoot = resolve(import.meta.dir, "../../..");

// DATA_DIR pointed somewhere silly would make this delete a lot more than a diary.
if (dir === parse(dir).root || dir === repoRoot || dir === resolve(process.env.HOME ?? process.env.USERPROFILE ?? "/")) {
  console.error(`Refusing to wipe ${dir}. Check DATA_DIR.`);
  process.exit(1);
}

const items = await readdir(dir).catch(() => [] as string[]);
if (!items.length) {
  console.log(`${dir} is already empty.`);
  process.exit(0);
}

if (!process.argv.includes("--yes")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`This deletes everything in ${dir}\n(${items.join(", ")}). Type "wipe" to confirm: `);
  rl.close();
  if (answer.trim() !== "wipe") {
    console.log("Nothing deleted.");
    process.exit(0);
  }
}

for (const item of items) await rm(join(dir, item), { recursive: true, force: true });
await ensureDataDir();
console.log(`Wiped ${dir}.`);
