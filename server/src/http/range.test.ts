import { describe, expect, it } from "vitest";
import { parseRange } from "./range.ts";

describe("parseRange", () => {
  const size = 1000;

  it("serves the whole file without a usable header", () => {
    expect(parseRange(undefined, size)).toBeNull();
    expect(parseRange("bytes=-", size)).toBeNull();
    expect(parseRange("items=0-5", size)).toBeNull();
  });

  it("parses explicit and open-ended ranges", () => {
    expect(parseRange("bytes=0-1", size)).toEqual({ start: 0, end: 1 });
    expect(parseRange("bytes=500-", size)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=900-5000", size)).toEqual({ start: 900, end: 999 });
  });

  it("parses suffix ranges", () => {
    expect(parseRange("bytes=-100", size)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", size)).toEqual({ start: 0, end: 999 });
  });

  it("rejects ranges outside the file", () => {
    expect(parseRange("bytes=1000-", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=10-5", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", size)).toBe("unsatisfiable");
  });
});
