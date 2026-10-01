import { config } from "../config";

export type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
};
export type ToolCall = { function: { name: string; arguments: Record<string, unknown> } };
/** Ollama-style tool schema. */
export type ToolSchema = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

type ChatOptions = {
  model: string;
  messages: OllamaMessage[];
  tools?: ToolSchema[];
  /** JSON schema to constrain the output to. */
  format?: Record<string, unknown>;
  temperature?: number;
};

function body(opts: ChatOptions, stream: boolean) {
  return JSON.stringify({
    model: opts.model,
    messages: opts.messages,
    tools: opts.tools?.length ? opts.tools : undefined,
    format: opts.format,
    options: opts.temperature === undefined ? undefined : { temperature: opts.temperature },
    keep_alive: config.keepAlive,
    stream,
  });
}

async function post(opts: ChatOptions, stream: boolean): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${config.ollamaHost}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body(opts, stream),
    });
  } catch (e) {
    throw new LLMUnavailableError(`Can't reach Ollama at ${config.ollamaHost}`, { cause: e });
  }
  if (!res.ok) throw new LLMUnavailableError(`Ollama ${res.status}: ${await res.text()}`);
  return res;
}

export class LLMUnavailableError extends Error {}

/** One complete reply (no streaming). */
export async function chat(opts: ChatOptions): Promise<OllamaMessage> {
  const res = await post(opts, false);
  const data = (await res.json()) as { message: OllamaMessage };
  return data.message;
}

/** Stream reply text token by token. */
export async function* chatStream(opts: ChatOptions): AsyncGenerator<string> {
  const res = await post(opts, true);
  const decoder = new TextDecoder();
  let buffer = "";
  // Ollama streams one JSON object per line.
  for await (const chunk of res.body!) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const text = JSON.parse(line).message?.content;
      if (text) yield text;
    }
  }
}

/** Embed texts with an embedding model: one vector per text, in order. Sent in batches. */
export async function embed(model: string, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    let res: Response;
    try {
      res = await fetch(`${config.ollamaHost}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts.slice(i, i + 64), keep_alive: config.keepAlive }),
      });
    } catch (e) {
      throw new LLMUnavailableError(`Can't reach Ollama at ${config.ollamaHost}`, { cause: e });
    }
    if (!res.ok) throw new LLMUnavailableError(`Ollama ${res.status}: ${await res.text()}`);
    out.push(...((await res.json()) as { embeddings: number[][] }).embeddings);
  }
  return out;
}

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
