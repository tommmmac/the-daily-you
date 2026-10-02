import { Hono } from "hono";
import { MemoryUpdate, ThreadPatch, type Memory, type MemoryChange, type MemoryLogEntry, type Thread } from "@daily-you/shared";
import { diaryDate } from "../store/dates";
import { readMemory, readMemoryLog, restoreMemory, writeMemory } from "../store/memory";
import { isLive, readThreads, setThreadStatus } from "../store/threads";
import { apiError } from "./errors";

export const memoryRoutes = new Hono();

memoryRoutes.get("/memory", async (c) => c.json<Memory>({ text: await readMemory() }));

memoryRoutes.put("/memory", async (c) => {
  const body = MemoryUpdate.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.message);
  const undo = await writeMemory(body.data.text);
  return c.json<MemoryChange>({ text: await readMemory(), undo });
});

memoryRoutes.post("/memory/versions/:v/restore", async (c) => {
  const v = Number(c.req.param("v"));
  if (!Number.isInteger(v) || v < 1) return apiError(c, 400, "invalid_request", "Bad version number");
  const restored = await restoreMemory(v);
  if (!restored) return apiError(c, 404, "not_found", `No version ${v} of the facts file`);
  return c.json<MemoryChange>(restored);
});

// What the Archivist changed after each print, newest first.
memoryRoutes.get("/memory/log", async (c) => c.json<MemoryLogEntry[]>(await readMemoryLog()));

// Open threads that haven't expired, soonest first (including ones not due yet).
memoryRoutes.get("/threads", async (c) => {
  const today = diaryDate();
  const live = (await readThreads()).filter((t) => isLive(t, today)).sort((a, b) => a.due.localeCompare(b.due));
  return c.json<Thread[]>(live);
});

memoryRoutes.patch("/threads/:id", async (c) => {
  const body = ThreadPatch.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.message);
  const thread = await setThreadStatus(c.req.param("id"), body.data.status);
  if (!thread) return apiError(c, 404, "not_found", "No such thread");
  return c.json<Thread>(thread);
});
