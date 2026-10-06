// Typed client for the Bun server. Shapes come from @daily-you/shared.
import type {
  ApiError,
  AuthStatus,
  PushKey,
  CalendarDay,
  CalendarTest,
  ChangeResult,
  ChatEvent,
  Entry,
  EntrySummary,
  Health,
  Memory,
  MemoryChange,
  MemoryLogEntry,
  PrintResult,
  Session,
  Settings,
  SettingsPatch,
  Thread,
  ThreadPatch,
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

/** Fired on window when the server says this device isn't signed in. */
export const SIGNED_OUT = "dailyyou:signed-out";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    // Signed out (from another device, or the passphrase changed): show the sign-in page.
    if (res.status === 401 && !path.startsWith("/auth")) window.dispatchEvent(new Event(SIGNED_OUT));
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
    if (res.status === 401) window.dispatchEvent(new Event(SIGNED_OUT));
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
  getMemory: () => request<Memory>("/memory"),
  saveMemory: (text: string) => request<MemoryChange>("/memory", { method: "PUT", body: JSON.stringify({ text }) }),
  restoreMemory: (version: number) => post<MemoryChange>(`/memory/versions/${version}/restore`, {}),
  getMemoryLog: () => request<MemoryLogEntry[]>("/memory/log"),
  listThreads: () => request<Thread[]>("/threads"),
  updateThread: (id: string, status: ThreadPatch["status"]) =>
    request<Thread>(`/threads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getSettings: () => request<Settings>("/settings"),
  updateSettings: (patch: SettingsPatch) =>
    request<Settings>("/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  calendarToday: () => request<CalendarDay>("/calendar/today"),
  testCalendar: (url: string) => post<CalendarTest>("/calendar/test", { url }),
  auth: () => request<AuthStatus>("/auth"),
  login: (passphrase: string) => post<{ ok: true }>("/auth/login", { passphrase }),
  logout: () => post<{ ok: true }>("/auth/logout", {}),
  setPassphrase: (passphrase: string) =>
    request<{ ok: true }>("/auth/passphrase", { method: "PUT", body: JSON.stringify({ passphrase }) }),
  clearPassphrase: () => del<{ ok: true }>("/auth/passphrase"),
  signOutEverywhere: () => del<{ ok: true }>("/auth/sessions"),
  pushKey: () => request<PushKey>("/push/key"),
  pushSubscribe: (subscription: PushSubscriptionJSON) => post<{ ok: true }>("/push/subscribe", subscription),
  pushUnsubscribe: (endpoint: string) => post<{ ok: true }>("/push/unsubscribe", { endpoint }),
  pushTest: (endpoint: string) => post<{ ok: true }>("/push/test", { endpoint }),
};
