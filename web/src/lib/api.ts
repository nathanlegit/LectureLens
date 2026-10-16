import type { AskEvent, AskMode } from "@lecture-lens/shared";

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

/** POSTs a question and calls `onEvent` for each server-sent event until the stream ends. */
export async function askStream(lectureId: string, question: string, mode: AskMode, onEvent: (e: AskEvent) => void, signal?: AbortSignal) {
  const res = await fetch(`/api/lectures/${lectureId}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, mode }),
    signal,
  });
  if (!res.ok || !res.body) {
    const message = (await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`;
    onEvent({ type: "error", message });
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    // SSE events are separated by a blank line; only the data line carries our JSON.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = raw
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as AskEvent);
    }
  }
}

export const frameUrl = (lectureId: string, frameId: string) => `/media/${lectureId}/frames/${frameId}.jpg`;

export function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hh > 0 ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

// Writes (new module, upload, retry) need the deployment's passcode. It is asked for once and kept
// in this browser; a 401 forgets it so the next attempt asks again.
const PASSCODE_KEY = "lecture-lens-passcode";

export function getPasscode(): string | null {
  let code: string | null = null;
  try {
    code = localStorage.getItem(PASSCODE_KEY);
  } catch {
    // storage blocked: fall through to asking
  }
  if (!code) {
    code = window.prompt("Upload passcode")?.trim() || null;
    if (code) {
      try {
        localStorage.setItem(PASSCODE_KEY, code);
      } catch {
        // not remembered; fine
      }
    }
  }
  return code;
}

function forgetPasscode() {
  try {
    localStorage.removeItem(PASSCODE_KEY);
  } catch {
    // nothing stored
  }
}

export class ApiError extends Error {}

export async function postWrite<T>(path: string, body?: unknown): Promise<T> {
  const passcode = getPasscode();
  if (!passcode) throw new ApiError("A passcode is needed to make changes.");
  const res = await fetch(`/api/write${path}`, {
    method: "POST",
    headers: { "x-passcode": passcode, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (res.status === 401) forgetPasscode();
  if (!res.ok) throw new ApiError(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

/** XMLHttpRequest rather than fetch: fetch cannot report upload progress. */
export function uploadLecture(moduleId: string, file: File, title: string, week: number | null, onProgress: (fraction: number) => void) {
  const passcode = getPasscode();
  if (!passcode) return Promise.reject(new ApiError("A passcode is needed to upload."));
  return new Promise<{ id: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/write/modules/${moduleId}/lectures?title=${encodeURIComponent(title)}${week === null ? "" : `&week=${week}`}`);
    xhr.setRequestHeader("x-passcode", passcode);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const json = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return null;
        }
      })();
      if (xhr.status === 401) forgetPasscode();
      if (xhr.status >= 200 && xhr.status < 300) resolve(json);
      else reject(new ApiError(json?.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new ApiError("The upload was interrupted. Check your connection and try again."));
    xhr.send(file);
  });
}
