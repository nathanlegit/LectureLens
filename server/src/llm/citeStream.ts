/**
 * Turns a streamed answer into text and checked citations as it arrives.
 *
 * The model cites timeline blocks as [F07] (or [F07, F12]). Text is held back from a "[" until
 * the bracket closes or it clearly is not a citation (maths like [0,1] or [x], or 64 characters
 * with no "]"), so an ID split across two deltas still parses. Unknown IDs are dropped: a chip is
 * only ever shown for a block that exists.
 */

const MAX_HOLD = 64;
const CITATION = /^\[\s*F\d{1,3}(\s*,\s*F\d{1,3})*\s*\]$/;
const MAYBE_CITATION = /^\[\s*(F\d{0,3}(\s*,\s*(F\d{0,3})?)*)?$/;

export type CiteStreamEvent = { type: "text"; text: string } | { type: "cite"; id: string };

export class CiteStream {
  private held = "";
  readonly cited: string[] = [];
  readonly dropped: string[] = [];

  constructor(private readonly knownIds: ReadonlySet<string>) {}

  push(delta: string): CiteStreamEvent[] {
    const events: CiteStreamEvent[] = [];
    let text = "";
    for (const ch of delta) {
      if (this.held) {
        this.held += ch;
        if (ch === "]") {
          if (CITATION.test(this.held)) {
            if (text) events.push({ type: "text", text });
            text = "";
            events.push(...this.resolve(this.held));
          } else {
            text += this.held;
          }
          this.held = "";
        } else if (!MAYBE_CITATION.test(this.held) || this.held.length > MAX_HOLD) {
          text += this.held;
          this.held = "";
        }
      } else if (ch === "[") {
        this.held = ch;
      } else {
        text += ch;
      }
    }
    if (text) events.push({ type: "text", text });
    return events;
  }

  /** Call when the stream ends: releases any held text that never became a citation. */
  end(): CiteStreamEvent[] {
    const rest = this.held;
    this.held = "";
    return rest ? [{ type: "text", text: rest }] : [];
  }

  private resolve(bracket: string): CiteStreamEvent[] {
    const events: CiteStreamEvent[] = [];
    for (const id of bracket.slice(1, -1).split(",").map((s) => s.trim())) {
      if (this.knownIds.has(id)) {
        this.cited.push(id);
        events.push({ type: "cite", id });
      } else {
        this.dropped.push(id);
      }
    }
    return events;
  }
}
