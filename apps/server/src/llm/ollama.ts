import { config } from "../config";

/** Installed model names, or null if Ollama isn't reachable. */
export async function listModels(): Promise<string[] | null> {
  try {
    const res = await fetch(`${config.ollamaHost}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { models: { name: string }[] };
    return data.models.map((m) => m.name);
  } catch {
    return null;
  }
}
