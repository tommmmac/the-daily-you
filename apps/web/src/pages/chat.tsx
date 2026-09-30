import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import type { Session } from "@daily-you/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { longDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type ChatMsg = { role: "user" | "assistant"; content: string };

// The current session id is remembered so a refresh doesn't lose the chat.
const SESSION_KEY = "daily-you.session";
const MAX_SESSION_AGE_MS = 18 * 60 * 60 * 1000;

function storedSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
function storeSessionId(id: string | null) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: the chat still works, it just won't survive a refresh.
  }
}

/** Resume the saved session if it's recent, otherwise start a new one. */
async function loadSession(): Promise<Session> {
  const id = storedSessionId();
  if (id) {
    const session = await api.getSession(id).catch(() => null);
    if (session && Date.now() - new Date(session.created).getTime() < MAX_SESSION_AGE_MS) return session;
  }
  const session = await api.createSession();
  storeSessionId(session.id);
  return session;
}

export function ChatPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null); // the reply being typed
  const [input, setInput] = useState("");
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether this day already has an entry: printing then adds a page instead of the front page.
  const [printed, setPrinted] = useState(false);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  const busy = streaming !== null || printing;
  const hasUserMessage = messages.some((m) => m.role === "user");

  async function stream(sessionId: string, message?: string) {
    setError(null);
    setStreaming("");
    let reply = "";
    try {
      for await (const ev of api.chat(sessionId, message)) {
        if (ev.event === "token") {
          reply += ev.data.text;
          setStreaming(reply);
        } else if (ev.event === "error") {
          throw new Error(ev.data.message);
        }
      }
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStreaming(null);
    }
  }

  async function start() {
    setError(null);
    try {
      const s = await loadSession();
      setSession(s);
      setMessages(s.messages.map(({ role, content }) => ({ role, content })));
      api.getEntry(s.date).then(
        () => setPrinted(true),
        () => setPrinted(false),
      );
      // A brand new session: the Reporter opens the interview.
      if (s.messages.length === 0) await stream(s.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start a chat.");
    }
  }

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in dev
    started.current = true;
    void start();
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !session || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    await stream(session.id, text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  async function goToPrint() {
    if (!session) return;
    setPrinting(true);
    setError(null);
    try {
      const result = await api.print(session.id);
      storeSessionId(null);
      navigate(`/journal/${result.date}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Printing failed.");
      setPrinting(false);
    }
  }

  function newChat() {
    storeSessionId(null);
    setSession(null);
    setMessages([]);
    void start();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl font-bold">Today's interview</h2>
        {session && (
          <span className="text-right text-xs uppercase tracking-wider text-muted-foreground">
            {longDate(session.date)}
          </span>
        )}
      </div>

      <div className="flex min-h-[40svh] flex-col gap-3" aria-live="polite">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.content}
          </Bubble>
        ))}
        {streaming !== null && (
          <Bubble role="assistant">{streaming || <span className="animate-pulse text-muted-foreground">…</span>}</Bubble>
        )}
        <div ref={bottom} />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}{" "}
          {!session && (
            <button className="font-medium underline hover:no-underline" onClick={() => void start()}>
              Try again
            </button>
          )}
        </p>
      )}

      <form onSubmit={send} className="sticky bottom-0 flex flex-col gap-2 border-t bg-background py-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={printing ? "Setting type…" : "Tell the Reporter about your day…"}
          disabled={!session || printing}
          rows={2}
          className="resize-none"
          autoFocus
        />
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={newChat} disabled={busy}>
            New chat
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={goToPrint} disabled={busy || !hasUserMessage}>
              {printing ? "Printing…" : printed ? "Add a page" : "Go to print"}
            </Button>
            <Button type="submit" disabled={busy || !input.trim()}>
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Bubble({ role, children }: { role: ChatMsg["role"]; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed",
        role === "user" ? "self-end bg-foreground text-background" : "self-start bg-muted",
      )}
    >
      {children}
    </div>
  );
}
