import { describe, expect, it } from "vitest";
import { checkQuiz, shuffleOptions } from "./quiz.ts";

const option = (text: string, correct = false) => ({ text, correct, misconception: correct ? null : `mix-up ${text}` });
const question = (blockId = "F02", options = [option("a", true), option("b"), option("c"), option("d")]) => ({
  question: "q",
  options,
  explanation: "e",
  blockId,
});

describe("checkQuiz", () => {
  const blocks = new Set(["F02", "F03"]);

  it("accepts a well-formed quiz", () => {
    expect(checkQuiz({ questions: [question(), question(), question("F03")] }, blocks)).toEqual([]);
  });

  it("rejects wrong counts, missing notes and blocks outside the chapter", () => {
    const problems = checkQuiz(
      {
        questions: [
          question("F02", [option("a", true), option("b", true), option("c"), option("d")]),
          question("F02", [option("a", true), { text: "b", correct: false, misconception: null }, option("c"), option("d")]),
          question("F09"),
        ],
      },
      blocks,
    );
    expect(problems).toEqual([
      "question 1 has 2 correct options, not 1",
      "question 2 has a wrong option without a misconception note",
      "question 3 cites F09, which is not in this chapter",
    ]);
    expect(checkQuiz({ questions: [question()] }, blocks)).toContain("expected 3 to 5 questions, got 1");
  });
});

describe("shuffleOptions", () => {
  it("is a stable permutation for a given seed", () => {
    const items = ["a", "b", "c", "d"];
    const once = shuffleOptions(items, "seed-1");
    expect(shuffleOptions(items, "seed-1")).toEqual(once);
    expect([...once].sort()).toEqual(items);
  });

  it("moves the first option around across seeds", () => {
    const positions = new Set(Array.from({ length: 40 }, (_, i) => shuffleOptions(["a", "b", "c", "d"], `s${i}`).indexOf("a")));
    expect(positions.size).toBe(4);
  });
});
