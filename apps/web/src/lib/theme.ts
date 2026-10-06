// Which paper the app looks like. Kept per device (in the browser, not settings.json),
// so the phone can read the night edition while the computer stays on the broadsheet.
// index.html applies it before the first paint too, so the page doesn't flash.
import { useEffect, useState } from "react";

export type Paper = "broadsheet" | "tabloid" | "night" | "gazette" | "gossip" | "terminal";
/** "auto" is the broadsheet by day and the night edition when the device is in dark mode. */
export type ThemeChoice = Paper | "auto";

export const THEMES: { id: ThemeChoice; name: string; blurb: string }[] = [
  { id: "auto", name: "Automatic", blurb: "Broadsheet by day, night edition when your device is in dark mode." },
  { id: "broadsheet", name: "Broadsheet", blurb: "Black ink on cream newsprint." },
  { id: "tabloid", name: "Tabloid", blurb: "Red top, big shouty headlines." },
  { id: "night", name: "Night edition", blurb: "Easy on the eyes after dark." },
  { id: "gazette", name: "Gazette", blurb: "An 1890s paper, gone yellow with age." },
  { id: "gossip", name: "Gossip", blurb: "Hot pink, all caps, all the goss." },
  { id: "terminal", name: "Newsroom terminal", blurb: "Your story on the wire, green on black." },
];

/** Papers with light text on a dark page. */
const DARK: Paper[] = ["night", "terminal"];

/** The phone's status bar colour for each paper. Matches --background (the masthead colour for the tabloid and gossip). */
const STATUS_BAR: Record<Paper, string> = {
  broadsheet: "#f7f3ea",
  tabloid: "#c4132a",
  night: "#1c1916",
  gazette: "#eadfc4",
  gossip: "#c8176f",
  terminal: "#0b1610",
};

const KEY = "theme";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v && THEMES.some((t) => t.id === v)) return v as ThemeChoice;
  } catch {
    // Storage blocked: fall through to the default.
  }
  return "auto";
}

const resolve = (choice: ThemeChoice): Paper => (choice === "auto" ? (darkQuery.matches ? "night" : "broadsheet") : choice);

function apply(choice: ThemeChoice) {
  const paper = resolve(choice);
  const root = document.documentElement;
  root.dataset.theme = paper;
  root.classList.toggle("dark", DARK.includes(paper));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", STATUS_BAR[paper]);
}

const listeners = new Set<() => void>();
let current = stored();
apply(current);
darkQuery.addEventListener("change", () => {
  if (current === "auto") apply(current);
});

export function setTheme(choice: ThemeChoice) {
  current = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Still applies for this visit.
  }
  apply(choice);
  listeners.forEach((l) => l());
}

export function useTheme(): ThemeChoice {
  const [choice, setChoice] = useState(current);
  useEffect(() => {
    const l = () => setChoice(current);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return choice;
}
