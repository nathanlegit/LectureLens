import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { config } from "../config.ts";
import type { DB } from "../db/db.ts";

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

/** Behind Railway's proxy the client is the first X-Forwarded-For entry. */
const clientIp = (c: Context) => c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";

/** Sliding-window limit per client IP, in memory (one server process). */
export function rateLimit(name: string, max: number, windowMs: number): MiddlewareHandler {
  const hits = new Map<string, number[]>();
  return async (c, next) => {
    const now = Date.now();
    const key = clientIp(c);
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return c.json({ error: `Too many ${name} requests. Wait a minute and try again.` }, 429);
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear(); // crude bound on memory; limits are best-effort anyway
    await next();
  };
}

// USD per million tokens: input, output, cache read, 5-minute cache write.
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
};

/** Estimated model spend since midnight UTC, from the usage log. */
export function spendTodayUsd(db: DB): number {
  const rows = db
    .prepare(
      "SELECT model, SUM(inputTok) i, SUM(outputTok) o, SUM(cacheReadTok) r, SUM(cacheWriteTok) w FROM usage_log WHERE at >= date('now') GROUP BY model",
    )
    .all() as { model: string; i: number; o: number; r: number; w: number }[];
  return rows.reduce((sum, { model, i, o, r, w }) => {
    const [pi, po, pr, pw] = PRICES[model] ?? PRICES["claude-sonnet-5-5"]!;
    return sum + (i * pi + o * po + r * pr + w * pw) / 1e6;
  }, 0);
}

/** Refuses model-spending requests once the day's estimated spend reaches DAILY_SPEND_CAP_USD. */
export function spendCap(db: DB): MiddlewareHandler {
  return async (c, next) => {
    if (spendTodayUsd(db) >= config.DAILY_SPEND_CAP_USD) {
      return c.json({ error: "This demo has reached today's usage limit. Please try again tomorrow." }, 429);
    }
    await next();
  };
}
