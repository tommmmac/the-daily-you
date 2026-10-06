import { Hono } from "hono";
import { z } from "zod";
import { PushSubscriptionInfo, type PushKey } from "@daily-you/shared";
import { publicKey, reminderMessage, send, subscribe, unsubscribe } from "../push";
import { apiError } from "./errors";

export const pushRoutes = new Hono();

const Endpoint = z.object({ endpoint: PushSubscriptionInfo.shape.endpoint });

pushRoutes.get("/push/key", async (c) => c.json<PushKey>({ publicKey: await publicKey() }));

// This device wants the nightly reminder.
pushRoutes.post("/push/subscribe", async (c) => {
  const body = PushSubscriptionInfo.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", "Not a push subscription");
  await subscribe(body.data, c.req.header("user-agent") ?? "");
  return c.json({ ok: true });
});

pushRoutes.post("/push/unsubscribe", async (c) => {
  const body = Endpoint.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", "Missing endpoint");
  await unsubscribe(body.data.endpoint);
  return c.json({ ok: true });
});

// Send the reminder to this device now, to check it works.
pushRoutes.post("/push/test", async (c) => {
  const body = Endpoint.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 400, "invalid_request", "Missing endpoint");
  const sent = await send(await reminderMessage(), body.data.endpoint);
  if (!sent) return apiError(c, 404, "not_found", "Couldn't reach this device. Turn reminders off and on again.");
  return c.json({ ok: true });
});
