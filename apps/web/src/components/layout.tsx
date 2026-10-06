import { useEffect } from "react";
import { NavLink, Outlet } from "react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { StatusDot } from "@/components/status-dot";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/chat", label: "Chat" },
  { to: "/journal", label: "Journal" },
  { to: "/memory", label: "Memory" },
];

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
  );

export function Layout() {
  const { settings } = useSettings();
  const paperName = settings?.paperName ?? "The Daily You";
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    document.title = paperName;
  }, [paperName]);

  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col px-4">
      <header className="pt-4 text-center">
        <div className="flex items-center justify-between border-b border-foreground pb-1 gazette:border-b-2 text-[11px] uppercase tracking-widest text-muted-foreground">
          <span>{today}</span>
          <StatusDot />
        </div>
        {/* The tabloid prints its name on a red band with the slogan on a black strip under it. The gazette's
            blackletter can't be read in capitals; the gossip mag's is huge and italic. */}
        <h1 className="bg-masthead py-3 font-masthead text-4xl font-bold uppercase leading-none tracking-wide text-masthead-foreground sm:text-6xl tabloid:mt-2 tabloid:py-4 tabloid:tracking-normal sm:tabloid:text-7xl gazette:normal-case gazette:tracking-normal sm:gazette:text-7xl gossip:font-black gossip:italic gossip:tracking-tight sm:gossip:text-7xl terminal:tracking-widest sm:terminal:text-7xl">
          {paperName}
        </h1>
        <p className="border-y-4 border-double border-foreground py-1 font-headline text-xs italic tracking-wide tabloid:border-0 tabloid:bg-foreground tabloid:text-background tabloid:uppercase tabloid:tracking-widest gazette:border-y-[6px] gossip:border-0 gossip:bg-foreground gossip:text-primary gossip:uppercase gossip:tracking-widest terminal:uppercase terminal:text-sm">
          All the news that's fit to journal
        </p>
      </header>

      <nav className="flex gap-1 border-b py-2">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={tabClass}>
            {t.label}
          </NavLink>
        ))}
        <NavLink to="/settings" className={(s) => cn(tabClass(s), "ml-auto")} aria-label="Settings">
          <SettingsIcon className="size-4" />
          <span className="hidden sm:inline">Settings</span>
        </NavLink>
      </nav>

      <main className="flex-1 py-6">
        <Outlet />
      </main>
    </div>
  );
}
