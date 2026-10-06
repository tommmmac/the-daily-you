/**
 * Start The Daily You in the background whenever you log in to Windows, so the app is
 * just there when you open it. Run from the repo root with `bun run autostart`, and
 * `bun run autostart --off` to stop it starting.
 *
 * It puts a small script in your Startup folder that builds the web app (so it's always
 * up to date with the code) and starts the server with no window. Output goes to logs/server.log.
 */
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "../src/config";

if (process.platform !== "win32") {
  console.error("Starting on login is only set up for Windows so far. Run `bun run build` then `bun run start` instead.");
  process.exit(1);
}

const repoRoot = resolve(import.meta.dir, "../../..");
const startup = join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
const script = join(startup, "The Daily You.vbs");
const url = `http://localhost:${config.port}`;

if (process.argv.includes("--off")) {
  await rm(script, { force: true });
  console.log("It won't start when you log in any more.");
  if (await running()) console.log("It's still running for now. To stop it, end bun.exe in Task Manager, or log out.");
  process.exit(0);
}

const bun = process.execPath;
const log = join(repoRoot, "logs", "server.log");
await mkdir(join(repoRoot, "logs"), { recursive: true });

// cmd strips the outer quotes, so the inner ones survive. VBScript escapes " as "".
const cmd = `cmd /c "("${bun}" run build & "${bun}" run start) > "${log}" 2>&1"`;
const vbs = [
  "' The Daily You: starts the server with no window when you log in.",
  "' Made by `bun run autostart`. Run `bun run autostart --off` (or delete this file) to stop.",
  'Set shell = CreateObject("WScript.Shell")',
  `shell.CurrentDirectory = "${repoRoot}"`,
  `shell.Run "${cmd.replaceAll('"', '""')}", 0, False`,
  "",
].join("\r\n");
await Bun.write(script, vbs);
console.log(`Added to Startup: ${script}`);

if (await running()) {
  console.log(`It's already running on ${url}. It'll start by itself from your next login.`);
} else {
  Bun.spawn(["wscript", script], { stdio: ["ignore", "ignore", "ignore"] }).unref();
  console.log("Starting it now (building first, so give it a few seconds)...");
  for (let i = 0; i < 60 && !(await running()); i++) await Bun.sleep(1000);
  console.log((await running()) ? `Running on ${url}` : `It hasn't come up yet. Check ${log}.`);
}
console.log(`Open ${url} in Chrome or Edge and use "Install" in the address bar to get it as an app.`);

async function running() {
  try {
    return (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}
