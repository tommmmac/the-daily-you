import { useEffect, useState, type FormEvent } from "react";
import Markdown from "react-markdown";
import { Link, useParams } from "react-router";
import { splitPages, type Entry } from "@daily-you/shared";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UndoBar } from "@/components/undo-bar";
import { ApiRequestError, api } from "@/lib/api";
import { longDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Undo = { message: string; version: number };

/** 1 -> "I", 4 -> "IV": volume numbers, newspaper style. */
function roman(n: number): string {
  const numerals: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [value, numeral] of numerals) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out || String(n);
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

// One printed issue, one section per page. Phase 2 gives this the proper newspaper treatment.
export function EntryPage() {
  const { date = "" } = useParams();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEntry(null);
    setError(null);
    setUndo(null);
    api
      .getEntry(date)
      .then(setEntry)
      .catch((e) =>
        setError(e instanceof ApiRequestError && e.status === 404 ? "No issue was printed that day." : errorMessage(e)),
      );
  }, [date]);

  /** Run an edit or delete, then reload. Returns whether it worked. */
  async function change(run: () => Promise<{ undo: number; deleted: boolean }>, message: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await run();
      setEntry(result.deleted ? null : await api.getEntry(date));
      setUndo({ message: result.deleted ? "Entry deleted." : message, version: result.undo });
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function doUndo() {
    if (!undo) return;
    setBusy(true);
    try {
      setEntry(await api.restoreVersion(date, undo.version));
      setUndo(null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const f = entry?.frontmatter;
  const pages = entry ? splitPages(entry.markdown) : [];

  return (
    <article className="flex flex-col gap-4">
      <Link to="/journal" className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline">
        ← Back issues
      </Link>

      {undo && <UndoBar message={undo.message} onUndo={doUndo} busy={busy} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!entry && !error && !undo && <p className="text-sm text-muted-foreground">Fetching from the archive…</p>}

      {f && (
        <>
          <div className="flex justify-between border-y border-foreground py-1 text-xs uppercase tracking-wider">
            <span>
              Vol. {roman(f.volume)} · No. {f.issue}
            </span>
            <span>{longDate(f.date)}</span>
            {f.mood !== undefined && <span>Mood {f.mood}/10</span>}
          </div>
          {pages.map((markdown, i) => (
            <PageView
              key={`${f.version}-${i}`}
              number={i + 1}
              total={pages.length}
              markdown={markdown}
              busy={busy}
              onEdit={(instruction) => change(() => api.editPage(date, i + 1, instruction), `Page ${i + 1} edited.`)}
              onDelete={() => void change(() => api.deletePage(date, i + 1), `Page ${i + 1} deleted.`)}
            />
          ))}
        </>
      )}
    </article>
  );
}

function PageView({
  number,
  total,
  markdown,
  busy,
  onEdit,
  onDelete,
}: {
  number: number;
  total: number;
  markdown: string;
  busy: boolean;
  onEdit: (instruction: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;
    setSaving(true);
    // On failure keep the box open with the instruction, so it can be retried.
    if (await onEdit(instruction.trim())) {
      setEditing(false);
      setInstruction("");
    }
    setSaving(false);
  }

  return (
    <section className={number > 1 ? "border-t-4 border-double border-foreground pt-4" : undefined}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {total > 1 && (number === 1 ? "Front page" : `Page ${number}`)}
        </span>
        <span className="flex items-center gap-1">
          <Button variant="ghost" size="xs" disabled={busy} onClick={() => setEditing((x) => !x)}>
            Edit
          </Button>
          <ConfirmButton label="Delete" confirmLabel={`Delete page ${number}`} onConfirm={onDelete} disabled={busy} />
        </span>
      </div>

      {editing && (
        <form onSubmit={submit} className="mb-4 flex flex-col gap-2 rounded-md border p-3">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='What should change? e.g. "make the headline funnier" or "it was 5km, not 3"'
            rows={2}
            className="resize-none"
            disabled={saving}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || busy || !instruction.trim()}>
              {saving ? "Setting type…" : "Apply"}
            </Button>
          </div>
        </form>
      )}

      <Story markdown={markdown} front={number === 1} />
    </section>
  );
}

/**
 * Pull the headline (`# ...`) and subhead (`*...*`) off the top of a page so they can sit
 * above the columns. Anything that doesn't look like that is left in the body.
 */
function splitHead(markdown: string) {
  const text = markdown.trimStart();
  const m = /^# (.+)\r?\n+(?:\*([^*\n](?:[^\n]*[^*\n])?)\*\r?\n+)?/.exec(text);
  if (!m) return { headline: null, subhead: null, body: text };
  return { headline: m[1]!.trim(), subhead: m[2]?.trim() ?? null, body: text.slice(m[0].length) };
}

function Story({ markdown, front }: { markdown: string; front: boolean }) {
  const { headline, subhead, body } = splitHead(markdown);
  return (
    <>
      {headline && (
        <header className="mb-5 text-center">
          <h2
            className={cn(
              "font-headline leading-tight text-balance",
              front ? "text-3xl font-bold uppercase sm:text-5xl" : "text-2xl font-bold sm:text-3xl",
            )}
          >
            {headline}
          </h2>
          {subhead && (
            <p className={cn("mt-2 font-headline italic text-muted-foreground", front ? "text-lg" : "text-base")}>
              {subhead}
            </p>
          )}
        </header>
      )}
      <div
        className={cn(
          "prose prose-stone max-w-none font-serif dark:prose-invert",
          // Two columns with a rule between them, like a broadsheet. One column on phones.
          "sm:columns-2 sm:gap-8 sm:[column-rule:1px_solid_var(--border)]",
          "prose-headings:font-headline prose-h2:mt-0 prose-h2:text-lg prose-h2:break-after-avoid",
          "prose-p:text-justify prose-p:hyphens-auto [&>p:first-of-type]:text-lg [&>p:first-of-type_strong]:tracking-wider",
          // The pull quote spans both columns between rules.
          "prose-blockquote:my-6 prose-blockquote:border-y prose-blockquote:border-l-0 prose-blockquote:border-foreground prose-blockquote:py-3 prose-blockquote:text-center prose-blockquote:font-headline prose-blockquote:text-2xl prose-blockquote:not-italic [&_blockquote]:[column-span:all]",
          "[&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none",
        )}
      >
        <Markdown>{body}</Markdown>
      </div>
    </>
  );
}
