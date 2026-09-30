import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Settings } from "@daily-you/shared";
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
