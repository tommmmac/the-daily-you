import { Hono } from "hono";
import { DateStr } from "@daily-you/shared";
import { listEntries, readEntry } from "../store/entries";
import { apiError } from "./errors";

export const entryRoutes = new Hono();

entryRoutes.get("/entries", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  for (const d of [from, to]) {
    if (d && !DateStr.safeParse(d).success) return apiError(c, 400, "invalid_request", `Bad date '${d}'`);
  }
  return c.json(await listEntries({ from, to }));
});

entryRoutes.get("/entries/:date", async (c) => {
  const date = c.req.param("date");
  if (!DateStr.safeParse(date).success) return apiError(c, 400, "invalid_request", `Bad date '${date}'`);
  const entry = await readEntry(date);
  if (!entry) return apiError(c, 404, "not_found", `No entry for ${date}`);
  return c.json(entry);
});
