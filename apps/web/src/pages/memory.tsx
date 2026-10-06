import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { MemoryLogEntry, Thread } from "@daily-you/shared";
import { UndoBar } from "@/components/undo-bar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

// What the Reporter remembers about you: the facts file (data/memory.md), things to
// follow up on, and what the Archivist picked up after each print.
export function MemoryPage() {
  const [saved, setSaved] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [undo, setUndo] = useState<number | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [log, setLog] = useState<MemoryLogEntry[]>([]);
  // The newest log entry's facts can be undone once from here.
  const [logUndone, setLogUndone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getMemory(), api.listThreads(), api.getMemoryLog()]).then(
      ([m, t, l]) => {
        setSaved(m.text);
        setText(m.text);
        setThreads(t);
        setLog(l);
      },
      (e) => setError(errorMessage(e)),
    );
  }, []);

  async function change(run: () => Promise<{ text: string; undo: number | null }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await run();
      setSaved(result.text);
      setText(result.text);
      return result.undo;
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const version = await change(() => api.saveMemory(text));
    if (version !== undefined) setUndo(version);
  }

  async function doUndo() {
    if (undo === null) return;
    if ((await change(() => api.restoreMemory(undo))) !== undefined) setUndo(null);
  }

  async function undoLearned(version: number) {
    const back = await change(() => api.restoreMemory(version));
    if (back !== undefined) {
      setLogUndone(true);
      setUndo(back);
    }
  }

  async function dismiss(id: string) {
    setError(null);
    try {
      await api.updateThread(id, "dismissed");
      setThreads((ts) => ts.filter((t) => t.id !== id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (saved === null && !error) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <h2 className="font-headline text-2xl font-bold">What the paper knows</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The Reporter reads this before every chat, so it can ask about the right job, friend or plan. It gets
            updated after each print too, and you can change anything. Keep it short: one fact per line. Lines in{" "}
            <code>&lt;!-- --&gt;</code> are hints and are ignored.
          </p>
        </div>

        {undo !== null && <UndoBar message="Saved." onUndo={doUndo} busy={busy} />}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setUndo(null);
          }}
          className="min-h-80 font-mono text-base md:text-sm"
          spellCheck
          aria-label="Facts file"
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={busy || text === saved}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      <Section title="Things to follow up on">
        {threads.length === 0 ? (
          <Empty>Nothing yet. Things like an upcoming exam or interview show up here after you print.</Empty>
        ) : (
          <ul className="flex flex-col divide-y">
            {threads.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {t.text}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ask from {shortDate(t.due)}
                    {t.tone === "tender" && ", gently"}
                  </span>
                </span>
                <Button variant="outline" size="xs" onClick={() => void dismiss(t.id)}>
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Learned after printing">
        {log.length === 0 ? (
          <Empty>Nothing yet. After each print, anything new the paper picked up is listed here.</Empty>
        ) : (
          <ul className="flex flex-col divide-y">
            {log.slice(0, 10).map((l, i) => (
              <li key={l.at} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">From {shortDate(l.date)}</p>
                  <ul className="mt-1">
                    {l.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                    {l.threadsAdded.map((t) => (
                      <li key={`+${t}`}>Follow up: {t}</li>
                    ))}
                    {l.threadsResolved.map((t) => (
                      <li key={`-${t}`} className="text-muted-foreground">
                        Answered: {t}
                      </li>
                    ))}
                  </ul>
                </div>
                {i === 0 && l.undo !== null && !logUndone && (
                  <Button variant="outline" size="xs" disabled={busy} onClick={() => void undoLearned(l.undo!)}>
                    Undo facts
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="w-full border-b border-foreground pb-1 text-xs font-medium uppercase tracking-widest">{title}</h3>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;
