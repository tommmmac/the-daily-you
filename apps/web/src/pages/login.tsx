import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

/** For phones and other devices. The computer the diary runs on never sees this. */
export function LoginPage({ passphraseSet, onSignedIn }: { passphraseSet: boolean; onSignedIn: () => Promise<void> }) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(passphrase);
      await onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 px-4 py-10 text-center">
      <header>
        <h1 className="border-b-4 border-double border-foreground bg-masthead pb-2 font-masthead text-4xl font-bold uppercase leading-none tracking-wide text-masthead-foreground tabloid:border-0 tabloid:py-3 tabloid:tracking-normal gazette:normal-case gazette:tracking-normal gossip:font-black gossip:italic gossip:tracking-tight">
          The Daily You
        </h1>
        <p className="pt-2 font-headline text-sm italic">Subscribers only</p>
      </header>

      {passphraseSet ? (
        <form onSubmit={submit} className="flex flex-col gap-3 text-left">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Passphrase</span>
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || !passphrase}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-xs text-muted-foreground">
            The one you set on your computer, in Settings. You&rsquo;ll stay signed in on this device.
          </p>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Phone access isn&rsquo;t set up yet. On the computer the diary runs on, open Settings and set a passphrase
          under <span className="font-medium text-foreground">Phone access</span>, then come back here.
        </p>
      )}
    </div>
  );
}
