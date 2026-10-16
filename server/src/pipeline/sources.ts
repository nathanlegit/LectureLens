import { spawn } from "node:child_process";
import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { config } from "../config.ts";

/**
 * Lectures can come from a YouTube link instead of a file. Only YouTube hosts are accepted, and
 * the download URL is rebuilt from the extracted video ID, so a pasted link can never point the
 * server elsewhere or smuggle options into the downloader.
 */
export type Source = { kind: "youtube"; id: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseSourceUrl(raw: string): Source | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return ytId(parts[0]);
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    if (parts[0] === "watch") return ytId(url.searchParams.get("v"));
    if (["shorts", "live", "embed", "v"].includes(parts[0] ?? "")) return ytId(parts[1]);
    return null;
  }
  return null;
}

const ytId = (id: string | null | undefined): Source | null => (id && YT_ID.test(id) ? { kind: "youtube", id } : null);

export const sourceLabel = (_s: Source) => "YouTube";

export interface DownloadOptions {
  maxBytes: number;
  maxDurationSec: number;
  onProgress: (fraction: number) => void;
}

/** Downloads the source to `outPath` and returns a title for it (the video's own name). */
export async function downloadSource(s: Source, outPath: string, opts: DownloadOptions): Promise<{ title: string | null }> {
  return downloadYouTube(s.id, outPath, opts);
}

/** Runs yt-dlp with an argument array (no shell), streaming stdout lines to `onLine`. */
function ytdlp(args: string[], onLine: (line: string) => void = () => {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.YTDLP_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let partial = "";
    child.stdout.on("data", (d: Buffer) => {
      const text = d.toString();
      out = (out + text).slice(-2_000_000);
      const lines = (partial + text).split(/\r?\n|\r/);
      partial = lines.pop() ?? "";
      lines.forEach(onLine);
    });
    child.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-4000)));
    child.on("error", (e) =>
      reject((e as NodeJS.ErrnoException).code === "ENOENT" ? new Error("YouTube import isn't available on this server (yt-dlp is not installed)") : e),
    );
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(youtubeError(err)))));
  });
}

/** Turns yt-dlp's stderr into something a student can act on. */
function youtubeError(stderr: string): string {
  if (/sign in to confirm|not a bot|429|too many requests/i.test(stderr)) {
    return "YouTube blocked the download from this server (it asks servers to prove they aren't bots). Download the video yourself and upload the file instead.";
  }
  if (/private video|members-only|sign in to confirm your age|age-restricted/i.test(stderr)) return "This YouTube video is private or restricted, so it can't be imported.";
  if (/video unavailable|does not exist|removed/i.test(stderr)) return "That YouTube video is unavailable.";
  if (/live event|is live|premieres/i.test(stderr)) return "Live streams can't be imported until they've finished.";
  if (/larger than max-filesize|File is larger/i.test(stderr)) return `The video is larger than ${config.MAX_UPLOAD_MB} MB even at 720p.`;
  const last = stderr.trim().split("\n").filter((l) => l.includes("ERROR")).at(-1);
  return last ? `YouTube import failed: ${last.replace(/^.*ERROR:\s*/, "").slice(0, 200)}` : "YouTube import failed.";
}

async function downloadYouTube(id: string, outPath: string, opts: DownloadOptions): Promise<{ title: string | null }> {
  const url = `https://www.youtube.com/watch?v=${id}`;
  const common = ["--no-playlist", "--no-warnings", "--no-config", "--ignore-config"];

  // Check length before spending bandwidth on it.
  const info = JSON.parse(await ytdlp([...common, "--dump-single-json", "--skip-download", url])) as {
    title?: string;
    duration?: number;
    is_live?: boolean;
  };
  if (info.is_live) throw new Error("Live streams can't be imported until they've finished.");
  if (info.duration && info.duration > opts.maxDurationSec) {
    throw new Error(`This video is ${Math.round(info.duration / 60)} minutes long; the limit is ${Math.round(opts.maxDurationSec / 60)} minutes.`);
  }

  // 720p is plenty to read a board and keeps files small. Prefer H.264 (avc1): it's only remuxed at
  // ingest, while AV1 or VP9 would mean a slow re-encode on the server's CPU.
  const base = join(dirname(outPath), "download");
  let lastPct = -1;
  await ytdlp(
    [
      ...common,
      "-f", "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][vcodec^=avc1]/bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/b",
      "--merge-output-format", "mp4",
      "--max-filesize", `${Math.floor(opts.maxBytes / 1024 ** 2)}M`,
      "--newline", "--progress",
      "-o", `${base}.%(ext)s`,
      url,
    ],
    (line) => {
      const m = line.match(/\[download\]\s+([\d.]+)%/);
      if (!m) return;
      const pct = Math.floor(Number(m[1]));
      if (pct !== lastPct) opts.onProgress(pct / 100);
      lastPct = pct;
    },
  );
  const file = readdirSync(dirname(outPath)).find((f) => f.startsWith("download.") && !f.endsWith(".part") && !f.includes(".f"));
  if (!file) throw new Error("YouTube import failed: the download produced no file.");
  renameSync(join(dirname(outPath), file), outPath);
  return { title: info.title?.trim() || null };
}

/** Removes leftovers from an interrupted download, so a retry starts clean. */
export function cleanDownloadParts(dir: string) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) if (f.startsWith("download.")) rmSync(join(dir, basename(f)), { force: true });
}
