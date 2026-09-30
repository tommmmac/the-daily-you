// Typed client for the Bun server. Shapes come from @daily-you/shared.
import type { Health } from "@daily-you/shared";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => get<Health>("/health"),
};
