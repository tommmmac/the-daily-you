import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { EntrySummary } from "@daily-you/shared";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/dates";

// The list of back issues, newest first.
export function JournalPage() {
  const [entries, setEntries] = useState<EntrySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listEntries()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load entries."));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-2xl font-bold">Back issues</h2>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!entries && !error && <p className="text-sm text-muted-foreground">Fetching the archive…</p>}
      {entries?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No issues printed yet.{" "}
          <Link to="/chat" className="underline">
            Tell the Reporter about your day
          </Link>
          .
        </p>
      )}

      <ul className="divide-y border-y">
        {entries?.map((e) => (
          <li key={e.date}>
            <Link to={`/journal/${e.date}`} className="flex flex-col gap-1 py-4 transition-colors hover:bg-muted/50">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                No. {e.issue} · {shortDate(e.date)}
                {e.mood !== undefined && ` · Mood ${e.mood}/10`}
              </span>
              <span className="font-serif text-lg font-bold leading-snug">{e.headline}</span>
              {e.tags.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {e.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
