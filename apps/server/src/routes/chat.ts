import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ChatRequest, CreateSessionRequest, PrintRequest, type ChatEvent, type PrintResult } from "@daily-you/shared";
import { BadOutputError, chat } from "../agents/_engine/run";
import { printDay } from "../newsroom/print";
import { LLMUnavailableError } from "../llm/ollama";
import { diaryDate } from "../store/dates";
import { createSession, getSession, sessionsForDate } from "../store/sessions";
import { apiError } from "./errors";

export const chatRoutes = new Hono();

chatRoutes.post("/sessions", async (c) => {
  const body = CreateSessionRequest.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.message);
  const session = await createSession(body.data.date ?? diaryDate());
  return c.json(session, 201);
});

chatRoutes.get("/sessions/:id", async (c) => {
  const session = await getSession(c.req.param("id"));
  if (!session) return apiError(c, 404, "not_found", "No such session");
  return c.json(session);
});

// Streams the reply as Server-Sent Events: route, token..., done (or error).
chatRoutes.post("/chat", async (c) => {
  const body = ChatRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.message);
  const session = await getSession(body.data.sessionId);
  if (!session) return apiError(c, 404, "not_found", "No such session");

  return streamSSE(c, async (stream) => {
    const send = (e: ChatEvent) => stream.writeSSE({ event: e.event, data: JSON.stringify(e.data) });
    let agent = "reporter";
    try {
      for await (const ev of chat(session, body.data.message)) {
        if (ev.type === "route") {
          agent = ev.agent;
          await send({ event: "route", data: { agent } });
        } else {
          await send({ event: "token", data: { text: ev.text } });
        }
      }
      await send({ event: "done", data: { agent } });
    } catch (e) {
      console.error("chat failed:", e);
      const message = e instanceof LLMUnavailableError ? "Can't reach Ollama. Is it running?" : "Something went wrong.";
      await send({ event: "error", data: { message } });
    }
  });
});

// Go to print: write the day's entry from every chat that day.
chatRoutes.post("/print", async (c) => {
  const body = PrintRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.message);
  const session = await getSession(body.data.sessionId);
  if (!session) return apiError(c, 404, "not_found", "No such session");

  const sessions = (await sessionsForDate(session.date)).filter((s) => s.messages.some((m) => m.role === "user"));
  if (!sessions.length) return apiError(c, 400, "invalid_request", "Nothing to print yet: chat about your day first");

  try {
    const { frontmatter: f } = await printDay(session.date, sessions);
    return c.json<PrintResult>({ date: f.date, headline: f.headline, version: f.version });
  } catch (e) {
    console.error("print failed:", e);
    if (e instanceof LLMUnavailableError) return apiError(c, 503, "llm_unavailable", "Can't reach Ollama. Is it running?");
    if (e instanceof BadOutputError) return apiError(c, 502, "llm_bad_output", e.message);
    throw e;
  }
});
