// Typed client for the Bun server. Shapes come from @daily-you/shared.
import type {
  ApiError,
  ChangeResult,
  ChatEvent,
  Entry,
  EntrySummary,
  Health,
  PrintResult,
  Session,
} from "@daily-you/shared";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: ApiError["error"]["code"],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(body?.error.message ?? `${res.status} ${path}`, res.status, body?.error.code);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });
const day = (date: string) => `/entries/${encodeURIComponent(date)}`;

/**
 * POST /api/chat, yielding each SSE event as it arrives.
 * (EventSource only supports GET, so we read the stream by hand.)
 */
async function* chat(sessionId: string, message?: string, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(body?.error.message ?? `${res.status} /chat`, res.status, body?.error.code);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    // Events are separated by a blank line.
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop()!;
    for (const raw of events) {
      let event = "";
      let data = "";
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (event && data) yield { event, data: JSON.parse(data) } as ChatEvent;
    }
  }
}

export const api = {
  health: () => request<Health>("/health"),
  createSession: () => post<Session>("/sessions", {}),
  getSession: (id: string) => request<Session>(`/sessions/${encodeURIComponent(id)}`),
  chat,
  print: (sessionId: string) => post<PrintResult>("/print", { sessionId }),
  listEntries: () => request<EntrySummary[]>("/entries"),
  getEntry: (date: string) => request<Entry>(day(date)),
  deleteEntry: (date: string) => del<ChangeResult>(day(date)),
  editPage: (date: string, page: number, instruction: string) =>
    post<ChangeResult>(`${day(date)}/pages/${page}/edit`, { instruction }),
  deletePage: (date: string, page: number) => del<ChangeResult>(`${day(date)}/pages/${page}`),
  restoreVersion: (date: string, version: number) => post<Entry>(`${day(date)}/versions/${version}/restore`, {}),
};
