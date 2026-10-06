// "Install as an app". Chrome and Edge offer it once, early, through beforeinstallprompt,
// so it's caught here at startup and kept for the Settings button.
import { useSyncExternalStore } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as InstallPrompt;
  notify();
});
window.addEventListener("appinstalled", () => {
  deferred = null;
  notify();
});

/** Running as the installed app, not in a browser tab. */
export const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** `install` is null when the browser hasn't offered it (already installed, iPhone, Firefox...). */
export function useInstall() {
  const prompt = useSyncExternalStore(subscribe, () => deferred);
  return {
    installed: isInstalled(),
    install: prompt
      ? async () => {
          await prompt.prompt();
          await prompt.userChoice;
          deferred = null;
          notify();
        }
      : null,
  };
}
