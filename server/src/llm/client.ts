import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.ts";
import type { DB } from "../db/db.ts";

export const MODELS = {
  frames: config.FRAMES_MODEL,
  reasoning: "claude-sonnet-5-5",
} as const;

// Retries 408/409/429/5xx and connection errors with backoff.
export const anthropic = new Anthropic({ maxRetries: 5 });

export function logUsage(db: DB, route: string, model: string, usage: Anthropic.Usage) {
  db.prepare(
    "INSERT INTO usage_log (route, model, inputTok, cacheReadTok, cacheWriteTok, outputTok) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    route,
    model,
    usage.input_tokens,
    usage.cache_read_input_tokens ?? 0,
    usage.cache_creation_input_tokens ?? 0,
    usage.output_tokens,
  );
}
