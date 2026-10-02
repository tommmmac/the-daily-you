import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { CalendarFeed, Settings } from "@daily-you/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/settings";

const hourLabel = (h: number) => (h === 0 ? "Midnight" : h === 12 ? "Noon" : `${h}am`);

// Who the paper is for and how it's made. Saved to data/settings.json.
export function SettingsPage() {
  const { settings, save } = useSettings();
  const [form, setForm] = useState<Settings | null>(null);
  const [installed, setInstalled] = useState<string[] | null>(null);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  useEffect(() => {
    api.health().then(
      (h) => setInstalled(h.ollama.up ? h.ollama.models : null),
      () => setInstalled(null),
    );
  }, []);

  if (!form) return <p className="text-sm text-muted-foreground">Loading settings…</p>;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setForm({ ...form, [key]: value });
    setStatus(null);
  };
  const setModel = (role: keyof Settings["models"], value: string) => set("models", { ...form.models, [role]: value });
  const changed = JSON.stringify(form) !== JSON.stringify(settings);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      setForm(await save({ ...form, dateline: form.dateline.toUpperCase() }));
      setStatus({ kind: "saved", message: "Saved." });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Couldn't save." });
    } finally {
      setSaving(false);
    }
  }

  const firstName = form.name.trim().split(/\s+/)[0];
  const suggestion = firstName ? `The ${firstName} Times` : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <h2 className="font-headline text-2xl font-bold">Settings</h2>

      <Section title="The paper">
        <Field label="Your name" hint="The Reporter calls you this. Leave blank to stay anonymous.">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Tom" maxLength={60} />
        </Field>
        <Field label="Pronouns" hint="How the paper writes about you, e.g. Local Man or Local Woman. Not set keeps it gender-neutral.">
          <PronounsSelect value={form.pronouns} onChange={(v) => set("pronouns", v)} />
        </Field>
        <Field
          label="Paper name"
          hint={
            <>
              Shown in the masthead.
              {suggestion && form.paperName !== suggestion && (
                <>
                  {" "}
                  How about{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
                    onClick={() => set("paperName", suggestion)}
                  >
                    {suggestion}
                  </button>
                  ?
                </>
              )}
            </>
          }
        >
          <Input value={form.paperName} onChange={(e) => set("paperName", e.target.value)} maxLength={60} required />
        </Field>
        <Field label="Dateline" hint="Where you are, printed before each story.">
          <Input
            value={form.dateline}
            onChange={(e) => set("dateline", e.target.value)}
            placeholder="e.g. MELBOURNE"
            className="uppercase"
            maxLength={40}
            required
          />
        </Field>
        <Field label="Language" hint="The Reporter chats in this and the paper is printed in it. Any language your model knows.">
          <Input
            value={form.language}
            onChange={(e) => set("language", e.target.value)}
            placeholder="e.g. English"
            list="languages"
            maxLength={40}
            required
          />
          <datalist id="languages">
            {["English", "Spanish", "French", "German", "Italian", "Portuguese", "Chinese", "Japanese", "Korean", "Vietnamese", "Hindi", "Indonesian"].map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="New day starts at" hint="Chats before this time count as the day before, for late nights.">
          <Select value={form.dayCutoffHour} onChange={(v) => set("dayCutoffHour", Number(v))}>
            {Array.from({ length: 13 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Calendars">
        <CalendarSettings calendars={form.calendars} onChange={(v) => set("calendars", v)} />
      </Section>

      <Section title="Models">
        {installed === null && (
          <p className="text-sm text-muted-foreground">Can't reach Ollama, so the installed models can't be listed.</p>
        )}
        <Field label="Reporter" hint="Chats with you. Faster is better here.">
          <ModelSelect value={form.models.reporter} installed={installed} onChange={(v) => setModel("reporter", v)} />
        </Field>
        <Field label="Copy Desk" hint="Writes and edits the pages. Better writing is worth waiting for.">
          <ModelSelect value={form.models.copydesk} installed={installed} onChange={(v) => setModel("copydesk", v)} />
        </Field>
      </Section>

      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t bg-background py-3">
        {status && (
          <span className={status.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {status.message}
          </span>
        )}
        <Button type="submit" disabled={saving || !changed}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 w-full border-b border-foreground pb-1 text-xs font-medium uppercase tracking-widest">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Select({ value, onChange, children }: { value: string | number; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
    </select>
  );
}

const PRONOUNS = ["he/him", "she/her", "they/them"];

/** The common pronouns, or "Other…" to type your own. "" is not set. */
function PronounsSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [other, setOther] = useState(value !== "" && !PRONOUNS.includes(value));
  return (
    <div className="flex gap-2">
      <Select
        value={other ? "other" : value}
        onChange={(v) => {
          setOther(v === "other");
          onChange(v === "other" ? "" : v);
        }}
      >
        <option value="">Not set (gender-neutral)</option>
        {PRONOUNS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value="other">Other…</option>
      </Select>
      {other && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. xe/xem"
          aria-label="Your pronouns"
          maxLength={30}
          autoFocus
        />
      )}
    </div>
  );
}

/** Installed models, plus the current one if it isn't installed (so it isn't silently swapped). */
function ModelSelect({
  value,
  installed,
  onChange,
}: {
  value: string;
  installed: string[] | null;
  onChange: (v: string) => void;
}) {
  // Embedding models (for search, later) can't chat, so leave them out.
  const options = (installed ?? []).filter((m) => !/embed/i.test(m));
  const missing = !options.includes(value);
  return (
    <Select value={value} onChange={onChange}>
      {missing && <option value={value}>{installed ? `${value} (not installed)` : value}</option>}
      {options.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </Select>
  );
}

/** Where each app hides its private iCal link. */
const CALENDAR_HELP = [
  ["Google Calendar", "Settings, pick the calendar, then Secret address in iCal format"],
  ["iCloud", "share the calendar, tick Public Calendar, and copy the link"],
  ["Outlook", "Settings, Shared calendars, Publish a calendar, then the ICS link"],
];

/** The site a link points at, so the private part of it isn't on screen. */
const hostOf = (url: string) => {
  try {
    return new URL(url.replace(/^webcal:/i, "https:")).host;
  } catch {
    return url.slice(0, 30);
  }
};

/** Calendar links: switch each on or off, rename or remove it, and add new ones after checking they work. */
function CalendarSettings({ calendars, onChange }: { calendars: CalendarFeed[]; onChange: (v: CalendarFeed[]) => void }) {
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const update = (i: number, patch: Partial<CalendarFeed>) => onChange(calendars.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function add() {
    const link = url.trim();
    if (!link || checking) return;
    if (calendars.some((c) => c.url === link)) {
      setNote({ kind: "error", message: "That calendar is already in the list." });
      return;
    }
    setChecking(true);
    setNote(null);
    try {
      const found = await api.testCalendar(link);
      const name = (found.name ?? `Calendar ${calendars.length + 1}`).slice(0, 40);
      onChange([...calendars, { name, url: link, enabled: true }]);
      setUrl("");
      const today = found.events.length;
      setNote({
        kind: "ok",
        message: `Added "${name}", with ${today ? `${today} event${today === 1 ? "" : "s"}` : "nothing"} on today. Save to keep it.`,
      });
    } catch (err) {
      setNote({ kind: "error", message: err instanceof Error ? err.message : "Couldn't read that calendar." });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        The Reporter sees what's on your calendar each day, so it can ask about the lecture or the dinner instead of
        &ldquo;what did you do today?&rdquo;. Events are also saved with each day&rsquo;s entry.
      </p>

      {calendars.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {calendars.map((c, i) => (
            <li key={c.url} className="flex items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                checked={c.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
                aria-label={`Use ${c.name}`}
                className="size-4 cursor-pointer accent-foreground"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Input
                  value={c.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  aria-label="Calendar name"
                  maxLength={40}
                  required
                  className="h-8"
                />
                <span className="truncate text-xs text-muted-foreground">{hostOf(c.url)}</span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(calendars.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Add a calendar</span>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setNote(null);
            }}
            onKeyDown={(e) => {
              // Enter adds the link rather than saving the whole page.
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="https://… or webcal://… (.ics)"
            aria-label="Calendar link"
            spellCheck={false}
            autoComplete="off"
          />
          <Button type="button" variant="outline" onClick={add} disabled={!url.trim() || checking}>
            {checking ? "Checking…" : "Add"}
          </Button>
        </div>
        {note && (
          <span className={note.kind === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {note.message}
          </span>
        )}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Where do I find the link?</summary>
          <ul className="mt-1.5 flex flex-col gap-1 pl-4">
            {CALENDAR_HELP.map(([app, how]) => (
              <li key={app} className="list-disc">
                <span className="font-medium text-foreground">{app}:</span> {how}.
              </li>
            ))}
          </ul>
          <p className="mt-1.5">
            The link is private, like a password: anyone with it can read the calendar. It&rsquo;s only kept on this
            computer, in data/settings.json.
          </p>
        </details>
      </div>
    </div>
  );
}
