import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

export type ByteRange = { start: number; end: number };

/**
 * Parses a single-range "Range: bytes=..." header against a file size. Returns null for no
 * usable header (serve the whole file) and "unsatisfiable" for a range outside the file.
 */
export function parseRange(header: string | undefined, size: number): ByteRange | null | "unsatisfiable" {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    // Suffix range: the last N bytes.
    const n = Number(m[2]);
    if (n === 0) return "unsatisfiable";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

/** Serves a file with range support, so the browser's video player can seek anywhere. */
export function serveFileWithRanges(path: string, rangeHeader: string | undefined, contentType: string): Response {
  const size = statSync(path).size;
  const range = parseRange(rangeHeader, size);
  const headers = new Headers({ "Accept-Ranges": "bytes", "Content-Type": contentType });

  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  return new Response(body, { status: range ? 206 : 200, headers });
}
