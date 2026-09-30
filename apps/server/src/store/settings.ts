/**
 * Settings from the Settings page, saved to data/settings.json. Only fields that were
 * changed are saved; everything else falls back to .env and the defaults (see config.ts).
 */
import { join } from "node:path";
import { SettingsPatch, type Settings } from "@daily-you/shared";
import { config } from "../config";

const settingsPath = () => join(config.dataDir, "settings.json");

/** The settings in use right now. */
export function currentSettings(): Settings {
  return {
    name: config.userName,
    paperName: config.paperName,
    dateline: config.dateline,
    dayCutoffHour: config.dayCutoffHour,
    models: { reporter: config.models.reporter, copydesk: config.models.copydesk, router: config.models.router },
  };
}

async function readSaved(): Promise<SettingsPatch> {
  const file = Bun.file(settingsPath());
  if (!(await file.exists())) return {};
  const parsed = SettingsPatch.safeParse(await file.json().catch(() => null));
  return parsed.success ? parsed.data : {};
}

/** Save the given fields on top of what's already saved. Returns the settings in use afterwards. */
export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const saved = await readSaved();
  const next: SettingsPatch = { ...saved, ...patch, models: { ...saved.models, ...patch.models } };
  await Bun.write(settingsPath(), JSON.stringify(next, null, 2));
  return currentSettings();
}
