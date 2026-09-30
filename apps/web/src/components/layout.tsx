import { NavLink, Outlet } from "react-router";
import { StatusDot } from "@/components/status-dot";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/chat", label: "Chat" },
  { to: "/journal", label: "Journal" },
];

export function Layout() {
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col px-4">
      <header className="border-b-4 border-double border-foreground pt-6 pb-2 text-center">
        <h1 className="font-serif text-4xl font-black tracking-tight sm:text-5xl">The Daily You</h1>
        <div className="mt-2 flex items-center justify-between border-t border-foreground pt-1 text-xs uppercase tracking-widest text-muted-foreground">
          <span>{today}</span>
          <StatusDot />
        </div>
      </header>

      <nav className="flex gap-1 border-b py-2">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 py-6">
        <Outlet />
      </main>
    </div>
  );
}
