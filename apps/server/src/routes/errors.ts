import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError } from "@daily-you/shared";

export function apiError(c: Context, status: ContentfulStatusCode, code: ApiError["error"]["code"], message: string) {
  return c.json<ApiError>({ error: { code, message } }, status);
}
