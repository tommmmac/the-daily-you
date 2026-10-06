// Settings that apply straight away: installing the app, phone access, and reminders on this device.
import { useEffect, useState, type FormEvent } from "react";
import type { AuthDevice } from "@daily-you/shared";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInstall } from "@/lib/install";
import { disablePush, enablePush, pushState, testPush, type PushState } from "@/lib/push";

const PHONE_GUIDE = "https://github.com/tommmmac/the-daily-you/blob/main/docs/PHONE.md";

/** Install button when the browser offers one, otherwise how to do it by hand. */
export function InstallApp() {
  const { installed, install } = useInstall();
  const local = useAuth().status?.local ?? true;
  if (installed) return <p className="text-sm text-muted-foreground">You&rsquo;re using the installed app.</p>;
  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
      <p>Install it to get its own window and an icon on your taskbar or home screen, like any other app.</p>
      {install ? (
        <div>
          <Button type="button" variant="outline" onClick={install}>
            Install The Daily You
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-1 pl-4">
          <li className="list-disc">
            <span className="font-medium text-foreground">Chrome or Edge:</span> the install icon at the right of the
            address bar, or the menu, then Install.
          </li>
          <li className="list-disc">
            <span className="font-medium text-foreground">iPhone:</span> in Safari, Share, then Add to Home Screen.
          </li>
          <li className="list-disc">
            <span className="font-medium text-foreground">Android:</span> in Chrome, the menu, then Add to Home screen.
          </li>
        </ul>
      )}
      {local && (
        <p>
          To have it running whenever your computer&rsquo;s on, run{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs text-foreground">bun run autostart</code> once (Windows).
        </p>
      )}
    </div>
  );
}

/** On the computer: set the passphrase and see who's signed in. On a phone: sign out. */
export function PhoneAccess() {
  const { status, refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (!status) return <p className="text-sm text-muted-foreground">Can&rsquo;t reach the server.</p>;

  const run = (action: () => Promise<unknown>) => async () => {
    setError(null);
    try {
      await action();
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
      return false;
    }
  };

  if (!status.local) {
    return (
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>You&rsquo;re signed in on this device. The passphrase and other devices are managed on your computer.</p>
        <div>
          <Button type="button" variant="outline" onClick={run(api.logout)}>
            Sign out
          </Button>
        </div>
        {error && <p className="text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-muted-foreground">
        To use the diary on your phone, reach this computer through Tailscale (
        <a href={PHONE_GUIDE} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:no-underline">
          the guide
        </a>
        ) and sign in there with a passphrase. This computer never has to sign in.
      </p>

      {status.passphraseSet ? (
        <>
          <Devices devices={status.devices} onSignOutAll={run(api.signOutEverywhere)} />
          <PassphraseForm label="Change passphrase" hint="Signs every device out." onSave={(p) => run(() => api.setPassphrase(p))()} />
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Don&rsquo;t want phone access any more?</span>
            <ConfirmButton label="Turn it off" confirmLabel="Yes, turn off" onConfirm={run(api.clearPassphrase)} />
          </div>
        </>
      ) : (
        <PassphraseForm label="Set a passphrase" hint="At least 8 characters. A few random words works well." onSave={(p) => run(() => api.setPassphrase(p))()} />
      )}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}

function PassphraseForm({ label, hint, onSave }: { label: string; hint: string; onSave: (p: string) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!(await onSave(value))) return;
    setValue("");
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <span className="font-medium">{label}</span>
      <div className="flex gap-2">
        <Input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          autoComplete="new-password"
          minLength={8}
          maxLength={200}
          aria-label={label}
        />
        <Button type="submit" variant="outline" disabled={value.length < 8}>
          Save
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">{saved ? "Saved. Sign in on your phone with it." : hint}</span>
    </form>
  );
}

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

function Devices({ devices, onSignOutAll }: { devices: AuthDevice[]; onSignOutAll: () => unknown }) {
  if (!devices.length) return <p className="text-muted-foreground">Phone access is on. No devices are signed in yet.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium">Signed in</span>
      <ul className="flex flex-col divide-y rounded-md border">
        {devices.map((d) => (
          <li key={d.id} className="flex justify-between gap-3 px-3 py-2">
            <span>{d.device}</span>
            <span className="text-muted-foreground">last used {ago(d.lastSeen)}</span>
          </li>
        ))}
      </ul>
      <div>
        <ConfirmButton label="Sign out everywhere" confirmLabel="Yes, sign out all" onConfirm={onSignOutAll} />
      </div>
    </div>
  );
}

/** Reminders on this device: on, off, or why they can't be. */
export function ReminderDevice({ time }: { time: string | null }) {
  const [state, setState] = useState<PushState | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState().then(setState, () => setState("unsupported"));
  }, []);

  const act = (action: () => Promise<void>, done: string) => async () => {
    setBusy(true);
    setNote(null);
    try {
      await action();
      setNote({ kind: "ok", message: done });
    } catch (err) {
      setNote({ kind: "error", message: err instanceof Error ? err.message : "That didn't work." });
    } finally {
      setState(await pushState().catch(() => "unsupported" as const));
      setBusy(false);
    }
  };

  const why: Partial<Record<PushState, string>> = {
    unsupported: isIos()
      ? "On iPhone, add the app to your Home Screen first (Share, then Add to Home Screen), and turn reminders on from there."
      : "This browser can't do notifications.",
    "no-worker": "Reminders work in the app itself (bun run start), not the dev server.",
    blocked: "Notifications are blocked for this site. Allow them in the browser's site settings, then reload.",
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">This device</span>
      {state && why[state] ? (
        <span className="text-xs text-muted-foreground">{why[state]}</span>
      ) : state === "on" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Reminders are on here.</span>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={act(testPush, "Sent. It should pop up in a few seconds.")}>
            Send a test
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={act(disablePush, "Turned off on this device.")}>
            Turn off here
          </Button>
        </div>
      ) : state === "off" ? (
        <div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={act(enablePush, "Done. You'll get the reminder here.")}>
            Remind me on this device
          </Button>
        </div>
      ) : null}
      {state === "on" && !time && <span className="text-xs text-muted-foreground">Pick a time above and save, or nothing will be sent.</span>}
      {note && <span className={note.kind === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{note.message}</span>}
    </div>
  );
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
