import { describe, expect, it } from "vitest";
import { CiteStream, type CiteStreamEvent } from "./citeStream.ts";

const known = new Set(["F01", "F07", "F12"]);

/** Feeds deltas through and merges adjacent text events for readable assertions. */
function feed(deltas: string[]) {
  const s = new CiteStream(known);
  const events = [...deltas.flatMap((d) => s.push(d)), ...s.end()];
  const merged: CiteStreamEvent[] = [];
  for (const e of events) {
    const last = merged.at(-1);
    if (e.type === "text" && last?.type === "text") last.text += e.text;
    else merged.push({ ...e });
  }
  return { events: merged, s };
}

describe("CiteStream", () => {
  it("emits a citation chip for a known ID", () => {
    expect(feed(["The rows are lines [F07]."]).events).toEqual([
      { type: "text", text: "The rows are lines " },
      { type: "cite", id: "F07" },
      { type: "text", text: "." },
    ]);
  });

  it("parses an ID split across deltas", () => {
    expect(feed(["lines [", "F0", "7] meet"]).events).toEqual([
      { type: "text", text: "lines " },
      { type: "cite", id: "F07" },
      { type: "text", text: " meet" },
    ]);
  });

  it("handles several IDs in one bracket", () => {
    expect(feed(["see [F01, F12]"]).events.filter((e) => e.type === "cite")).toEqual([
      { type: "cite", id: "F01" },
      { type: "cite", id: "F12" },
    ]);
  });

  it("handles long citation lists", () => {
    const s = new CiteStream(new Set(["F16", "F18", "F20", "F21", "F22", "F23"]));
    const events = [...s.push("meet at (1, 2) [F16, F18, F20, F21, F22, F23]."), ...s.end()];
    expect(events.filter((e) => e.type === "cite").map((e) => e.type === "cite" && e.id)).toEqual(["F16", "F18", "F20", "F21", "F22", "F23"]);
  });

  it("drops unknown IDs instead of rendering them", () => {
    const { events, s } = feed(["made up [F99] here"]);
    expect(events).toEqual([{ type: "text", text: "made up  here" }]);
    expect(s.dropped).toEqual(["F99"]);
  });

  it("leaves maths brackets alone", () => {
    expect(feed(["on [0,1] and [x, y] and [F] and A[i]"]).events).toEqual([
      { type: "text", text: "on [0,1] and [x, y] and [F] and A[i]" },
    ]);
  });

  it("releases an unclosed bracket at the end of the stream", () => {
    expect(feed(["trailing [F0"]).events).toEqual([{ type: "text", text: "trailing [F0" }]);
  });
});
