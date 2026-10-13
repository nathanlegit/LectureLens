import { z } from "zod";

// Parsed once at boot so a missing or malformed variable fails fast, not mid-pipeline.
const Env = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  DATA_DIR: z.string().default("./data"),
  PORT: z.coerce.number().int().default(8787),
  TRANSCRIBER: z.enum(["local", "groq"]).default("local"),
  WHISPER_CLI: z.string().default("whisper-cli"),
  WHISPER_MODEL_PATH: z.string().default("./models/ggml-large-v3-turbo.bin"),
  WHISPER_VAD_MODEL_PATH: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  UPLOAD_PASSCODE: z.string().optional(),
  DAILY_SPEND_CAP_USD: z.coerce.number().positive().default(5),
  // Model that reads frames. Sonnet by default: on a filmed board, Haiku stated wrong numbers
  // (dropped minus signs, guessed values hidden behind the lecturer); Sonnet marks them unreadable.
  FRAMES_MODEL: z.enum(["claude-haiku-5-5", "claude-sonnet-5-5"]).default("claude-sonnet-5-5"),
});

export type Config = z.infer<typeof Env>;

export const config: Config = Env.parse(process.env);
