import { THEMES, setTheme, useTheme, type Paper, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** A card per paper, each drawn in its own colours. Applies straight away, on this device only. */
export function ThemePicker() {
  const choice = useTheme();
  return (
    <div role="radiogroup" aria-label="Paper" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={choice === t.id}
          onClick={() => setTheme(t.id)}
          className={cn(
            "flex flex-col gap-2 rounded-md p-1.5 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
            choice === t.id ? "ring-2 ring-foreground" : "ring-1 ring-border hover:ring-foreground/40",
          )}
        >
          <Preview choice={t.id} />
          <span className="px-1 pb-1">
            <span className="block text-sm font-medium">{t.name}</span>
            <span className="block text-xs text-muted-foreground">{t.blurb}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** A tiny front page. Automatic shows the day and night papers side by side. */
function Preview({ choice }: { choice: ThemeChoice }) {
  if (choice === "auto") {
    return (
      <div className="flex overflow-hidden rounded-sm" aria-hidden>
        <MiniPage paper="broadsheet" className="w-1/2 rounded-none" />
        <MiniPage paper="night" className="w-1/2 rounded-none" />
      </div>
    );
  }
  return <MiniPage paper={choice} />;
}

function MiniPage({ paper, className }: { paper: Paper; className?: string }) {
  return (
    <div
      data-theme={paper}
      aria-hidden
      className={cn("flex h-24 flex-col gap-1 overflow-hidden rounded-sm border bg-background p-2 text-foreground", className)}
    >
      <div className="truncate bg-masthead text-center font-masthead text-[11px] font-bold uppercase leading-tight text-masthead-foreground tabloid:py-0.5 gazette:text-xs gazette:normal-case gossip:font-black gossip:italic terminal:text-sm">
        The Daily You
      </div>
      <div className="h-0.5 border-y border-foreground tabloid:h-1 tabloid:border-0 tabloid:bg-foreground gazette:h-1 gossip:h-1 gossip:border-0 gossip:bg-primary" />
      <div className="font-headline text-[10px] font-bold leading-tight">Local Person Has Day</div>
      <div className="flex flex-col gap-0.5">
        <div className="h-0.5 w-full rounded-full bg-muted-foreground/40" />
        <div className="h-0.5 w-full rounded-full bg-muted-foreground/40" />
        <div className="h-0.5 w-2/3 rounded-full bg-muted-foreground/40" />
      </div>
    </div>
  );
}
