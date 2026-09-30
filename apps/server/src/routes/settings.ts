import { Hono } from "hono";
import { SettingsPatch } from "@daily-you/shared";
import { currentSettings, updateSettings } from "../store/settings";
import { apiError } from "./errors";

export const settingsRoutes = new Hono();

settingsRoutes.get("/settings", (c) => c.json(currentSettings()));

settingsRoutes.patch("/settings", async (c) => {
  const body = SettingsPatch.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", body.error.message);
  return c.json(await updateSettings(body.data));
});
