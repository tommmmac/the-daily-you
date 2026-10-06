import { useEffect, useState } from "react";
import type { Health } from "@daily-you/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = { kind: "loading" } | { kind: "server-down" } | { kind: "ok"; health: Health };

/** Shows whether the server and Ollama are reachable. Rechecks every 30s. */
export function StatusDot() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    const check = () =>
      api
        .health()
        .then((health) => setStatus({ kind: "ok", health }))
        .catch(() => setStatus({ kind: "server-down" }));
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  const [color, label, title] =
    status.kind === "loading"
      ? ["bg-muted-foreground", "Checking…", ""]
      : status.kind === "server-down"
        ? ["bg-red-500", "Server offline", "Can't reach the server. Is it running on your computer?"]
        : status.health.ollama.up
          ? ["bg-green-500", "Presses running", status.health.ollama.models.join(", ")]
          : ["bg-amber-500", "Ollama offline", `Can't reach Ollama at ${status.health.ollama.host}`];

  return (
    <span className="flex items-center gap-1.5" title={title}>
      <span className={cn("size-2 rounded-full", color)} />
      {label}
    </span>
  );
}
