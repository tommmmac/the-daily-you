import { Hono, type Context } from "hono";
import { DateStr, EditRequest } from "@daily-you/shared";
import { BadOutputError } from "../agents/_engine/run";
import { LLMUnavailableError } from "../llm/ollama";
import { NoSuchPageError, deleteDay, deletePage, editPage } from "../newsroom/edit";
import { listEntries, listVersions, readEntry, restoreVersion } from "../store/entries";
import { apiError } from "./errors";

export const entryRoutes = new Hono();

/** The :date param, or null (after sending a 400) if it's not a date. */
function dateParam(c: Context): string | null {
  const date = c.req.param("date") ?? "";
  return DateStr.safeParse(date).success ? date : null;
}
const badDate = (c: Context) => apiError(c, 400, "invalid_request", `Bad date '${c.req.param("date")}'`);

entryRoutes.get("/entries", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  for (const d of [from, to]) {
    if (d && !DateStr.safeParse(d).success) return apiError(c, 400, "invalid_request", `Bad date '${d}'`);
  }
  return c.json(await listEntries({ from, to }));
});

entryRoutes.get("/entries/:date", async (c) => {
  const date = dateParam(c);
  if (!date) return badDate(c);
  const entry = await readEntry(date);
  if (!entry) return apiError(c, 404, "not_found", `No entry for ${date}`);
  return c.json(entry);
});

// Delete a whole day. The file is kept in versions/, so it can be restored.
entryRoutes.delete("/entries/:date", async (c) => {
  const date = dateParam(c);
  if (!date) return badDate(c);
  const result = await deleteDay(date);
  if (!result) return apiError(c, 404, "not_found", `No entry for ${date}`);
  return c.json(result);
});

// The Copy Desk rewrites one page following an instruction.
entryRoutes.post("/entries/:date/pages/:page/edit", async (c) => {
  const date = dateParam(c);
  if (!date) return badDate(c);
  const body = EditRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.message);
  try {
    return c.json(await editPage(date, Number(c.req.param("page")), body.data.instruction));
  } catch (e) {
    if (e instanceof NoSuchPageError) return apiError(c, 404, "not_found", e.message);
    if (e instanceof LLMUnavailableError) return apiError(c, 503, "llm_unavailable", "Can't reach Ollama. Is it running?");
    if (e instanceof BadOutputError) return apiError(c, 502, "llm_bad_output", e.message);
    throw e;
  }
});

entryRoutes.delete("/entries/:date/pages/:page", async (c) => {
  const date = dateParam(c);
  if (!date) return badDate(c);
  try {
    return c.json(await deletePage(date, Number(c.req.param("page"))));
  } catch (e) {
    if (e instanceof NoSuchPageError) return apiError(c, 404, "not_found", e.message);
    throw e;
  }
});

entryRoutes.get("/entries/:date/versions", async (c) => {
  const date = dateParam(c);
  if (!date) return badDate(c);
  return c.json(await listVersions(date));
});

// Bring back an old version (as a new version). This is what Undo uses.
entryRoutes.post("/entries/:date/versions/:v/restore", async (c) => {
  const date = dateParam(c);
  if (!date) return badDate(c);
  const entry = await restoreVersion(date, Number(c.req.param("v")));
  if (!entry) return apiError(c, 404, "not_found", `No version ${c.req.param("v")} of ${date}`);
  return c.json(entry);
});
