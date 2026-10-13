import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { config } from "../config.ts";

/**
 * Requires the shared passcode in the x-passcode header. With no UPLOAD_PASSCODE configured the
 * guarded routes are off entirely, so a forgotten env var never leaves them open.
 */
export const requirePasscode: MiddlewareHandler = async (c, next) => {
  const expected = config.UPLOAD_PASSCODE;
  if (!expected) return c.json({ error: "Uploads are disabled on this server" }, 403);
  const given = Buffer.from(c.req.header("x-passcode") ?? "");
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return c.json({ error: "Wrong passcode" }, 401);
  }
  await next();
};
