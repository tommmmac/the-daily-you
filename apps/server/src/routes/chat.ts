import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ChatRequest, CreateSessionRequest, PrintRequest, type ChatEvent, type PrintResult } from "@daily-you/shared";
import { BadOutputError, chat } from "../agents/_engine/run";
import { NothingToPrintError, printSession } from "../newsroom/print";
import { suggest } from "../newsroom/suggest";
import { LLMUnavailableError } from "../llm/ollama";
import { diaryDate } from "../store/dates";
import { createSession, getSession } from "../store/sessions";
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

// Streams the reply as Server-Sent Events: route, token..., done, maybe suggest (or error).
chatRoutes.post("/chat", async (c) => {
  const body = ChatRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.message);
  const session = await getSession(body.data.sessionId);
  if (!session) return apiError(c, 404, "not_found", "No such session");
  const { message } = body.data;

  return streamSSE(c, async (stream) => {
    const send = (e: ChatEvent) => stream.writeSSE({ event: e.event, data: JSON.stringify(e.data) });
    // Started before chat() adds the message to the session, and runs alongside the reply.
    const suggestion = message ? suggest(session, message).catch(() => null) : Promise.resolve(null);
    let agent = "reporter";
    try {
      for await (const ev of chat(session, message)) {
        if (ev.type === "route") {
          agent = ev.agent;
          await send({ event: "route", data: { agent } });
        } else {
          await send({ event: "token", data: { text: ev.text } });
        }
      }
      await send({ event: "done", data: { agent } });
      const offer = await suggestion;
      if (offer) await send({ event: "suggest", data: offer });
    } catch (e) {
      console.error("chat failed:", e);
      const message = e instanceof LLMUnavailableError ? "Can't reach Ollama. Is it running?" : "Something went wrong.";
      await send({ event: "error", data: { message } });
    }
  });
});

// Go to print: write this chat onto its day's entry (a new page, or its own page again).
chatRoutes.post("/print", async (c) => {
  const body = PrintRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.message);
  const session = await getSession(body.data.sessionId);
  if (!session) return apiError(c, 404, "not_found", "No such session");

  try {
    const { entry, page } = await printSession(session.date, session.id);
    const f = entry.frontmatter;
    return c.json<PrintResult>({ date: f.date, headline: f.pages[page - 1]!.headline, version: f.version, page });
  } catch (e) {
    if (e instanceof NothingToPrintError) return apiError(c, 400, "invalid_request", e.message);
    console.error("print failed:", e);
    if (e instanceof LLMUnavailableError) return apiError(c, 503, "llm_unavailable", "Can't reach Ollama. Is it running?");
    if (e instanceof BadOutputError) return apiError(c, 502, "llm_bad_output", e.message);
    throw e;
  }
});
