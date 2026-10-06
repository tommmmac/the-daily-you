// Who's asking: this computer (always let in) or another device, which signs in first.
// Wraps the whole app, so nothing else loads until it's allowed to.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthStatus } from "@daily-you/shared";
import { api, SIGNED_OUT } from "@/lib/api";
import { LoginPage } from "@/pages/login";

type AuthContext = { status: AuthStatus | null; refresh: () => Promise<void> };

const Ctx = createContext<AuthContext>({ status: null, refresh: async () => {} });

export function AuthGate({ children }: { children: ReactNode }) {
  // undefined: still checking. null: the server's down, so let the app show that itself.
  const [status, setStatus] = useState<AuthStatus | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    setStatus(await api.auth().catch(() => null));
  }, []);

  useEffect(() => {
    void refresh();
    const onSignedOut = () => void refresh();
    window.addEventListener(SIGNED_OUT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT, onSignedOut);
  }, [refresh]);

  if (status === undefined) return null;
  if (status && !status.signedIn) return <LoginPage passphraseSet={status.passphraseSet} onSignedIn={refresh} />;
  return <Ctx.Provider value={{ status, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
