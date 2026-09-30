import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { Link, useParams } from "react-router";
import type { Entry } from "@daily-you/shared";
import { ApiRequestError, api } from "@/lib/api";
import { longDate } from "@/lib/dates";

// One printed issue. Phase 2 gives this the proper newspaper treatment.
export function EntryPage() {
  const { date = "" } = useParams();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntry(null);
    setError(null);
    api
      .getEntry(date)
      .then(setEntry)
      .catch((e) =>
        setError(e instanceof ApiRequestError && e.status === 404 ? "No issue was printed that day." : String(e.message)),
      );
  }, [date]);

  const f = entry?.frontmatter;

  return (
    <article className="flex flex-col gap-4">
      <Link to="/journal" className="text-sm text-muted-foreground hover:underline">
        ← Back issues
      </Link>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!entry && !error && <p className="text-sm text-muted-foreground">Fetching from the archive…</p>}

      {f && (
        <>
          <div className="flex justify-between border-y border-foreground py-1 text-xs uppercase tracking-wider">
            <span>
              Vol. {f.volume} · No. {f.issue}
            </span>
            <span>{longDate(f.date)}</span>
            {f.mood !== undefined && <span>Mood {f.mood}/10</span>}
          </div>
          <div className="prose prose-stone max-w-none font-serif dark:prose-invert prose-headings:font-serif prose-h1:text-4xl prose-h1:leading-tight prose-blockquote:border-foreground prose-blockquote:text-xl">
            <Markdown>{entry.markdown}</Markdown>
          </div>
        </>
      )}
    </article>
  );
}
