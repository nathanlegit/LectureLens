import { describe, expect, it } from "vitest";
import { toVtt } from "./captions.ts";

describe("toVtt", () => {
  it("writes WebVTT cues with millisecond timestamps", () => {
    expect(toVtt([{ startSec: 0, endSec: 2.5, text: " Hello " }, { startSec: 3725.04, endSec: 3726, text: "Bye" }])).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nHello\n\n01:02:05.040 --> 01:02:06.000\nBye\n",
    );
  });

  it("drops empty or zero-length cues and neutralises text that would break a cue", () => {
    const vtt = toVtt([
      { startSec: 1, endSec: 1, text: "zero length" },
      { startSec: 2, endSec: 3, text: "   " },
      { startSec: 4, endSec: 5, text: "a --> b\n\nc" },
    ]);
    expect(vtt).toBe("WEBVTT\n\n00:00:04.000 --> 00:00:05.000\na → b\nc\n");
  });
});
