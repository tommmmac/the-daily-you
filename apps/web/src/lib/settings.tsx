// The app's settings, loaded once and shared, so saving on the Settings page
// updates the masthead straight away.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Settings, SettingsPatch } from "@daily-you/shared";
import { api } from "@/lib/api";

type SettingsContext = {
  /** null until loaded (or if the server is down). */
  settings: Settings | null;
  save: (patch: SettingsPatch) => Promise<Settings>;
};

const Ctx = createContext<SettingsContext>({
  settings: null,
  save: () => Promise.reject(new Error("SettingsProvider missing")),
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings, () => setSettings(null));
  }, []);

  const save = useCallback(async (patch: SettingsPatch) => {
    const next = await api.updateSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return <Ctx.Provider value={{ settings, save }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
