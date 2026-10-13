import { spawn } from "node:child_process";

export interface ExecResult {
  stdout: Buffer;
  stderr: string;
}

/** Runs a command to completion. Rejects with the tail of stderr on a non-zero exit. */
export function run(cmd: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new Error(`${cmd} exited with ${code}: ${err.slice(-2000)}`));
    });
  });
}

export interface ProbeResult {
  durationSec: number;
  sizeBytes: number;
  video: { codec: string; width: number; height: number } | null;
  audio: { codec: string } | null;
}

export async function ffprobe(path: string): Promise<ProbeResult> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]);
  const info = JSON.parse(stdout.toString()) as {
    format: { duration?: string; size?: string };
    streams: { codec_type: string; codec_name: string; width?: number; height?: number; disposition?: { attached_pic?: number } }[];
  };
  // Skip cover art: some MP4s carry a PNG/JPEG "video" stream marked as an attached picture.
  const v = info.streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const a = info.streams.find((s) => s.codec_type === "audio");
  return {
    durationSec: Number(info.format.duration ?? 0),
    sizeBytes: Number(info.format.size ?? 0),
    video: v ? { codec: v.codec_name, width: v.width ?? 0, height: v.height ?? 0 } : null,
    audio: a ? { codec: a.codec_name } : null,
  };
}
