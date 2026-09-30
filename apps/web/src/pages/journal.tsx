import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { EntrySummary } from "@daily-you/shared";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge } from "@/components/ui/badge";
import { UndoBar } from "@/components/undo-bar";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/dates";

// The list of back issues, newest first.
export function JournalPage() {
  const [entries, setEntries] = useState<EntrySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [undo, setUndo] = useState<{ date: string; version: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .listEntries()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load entries."));

  useEffect(() => {
    void load();
  }, []);

  // Deleting and undoing both go through `run` so the list reloads and errors show the same way.
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const remove = (date: string) =>
    run(async () => {
      const result = await api.deleteEntry(date);
      setUndo({ date, version: result.undo });
    });

  const doUndo = () =>
    run(async () => {
      if (!undo) return;
      await api.restoreVersion(undo.date, undo.version);
      setUndo(null);
    });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-2xl font-bold">Back issues</h2>

      {undo && <UndoBar message={`Deleted the issue for ${shortDate(undo.date)}.`} onUndo={doUndo} busy={busy} />}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!entries && !error && <p className="text-sm text-muted-foreground">Fetching the archive…</p>}
      {entries?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No issues printed yet.{" "}
          <Link to="/chat" className="underline transition-colors hover:text-foreground">
            Tell the Reporter about your day
          </Link>
          .
        </p>
      )}

      <ul className="divide-y border-y">
        {entries?.map((e) => (
          <li key={e.date} className="flex items-start gap-2">
            <Link
              to={`/journal/${e.date}`}
              className="group -mx-2 flex min-w-0 flex-1 flex-col gap-1 rounded-md px-2 py-4 transition-colors hover:bg-foreground/5"
            >
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                No. {e.issue} · {shortDate(e.date)}
                {e.mood !== undefined && ` · Mood ${e.mood}/10`}
              </span>
              <span className="font-serif text-lg font-bold leading-snug group-hover:underline">{e.headline}</span>
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
            <div className="pt-4">
              <ConfirmButton label="Delete" onConfirm={() => void remove(e.date)} disabled={busy} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
