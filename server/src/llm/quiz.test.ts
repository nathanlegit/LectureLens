import { describe, expect, it } from "vitest";
import { checkQuiz, shuffleOptions } from "./quiz.ts";

const option = (text: string, correct = false) => ({ text, correct, misconception: correct ? null : `mix-up ${text}` });
const question = (blockId = "F02", options = [option("a", true), option("b"), option("c"), option("d")]) => ({
  question: "q",
  options,
  explanation: "e",
  blockId,
});
const quiz = (questions: ReturnType<typeof question>[]) => ({ covered: true, notCoveredReason: null, questions });

describe("checkQuiz", () => {
  const blocks = new Set(["F02", "F03", "F40"]);

  it("accepts a well-formed quiz, from any part of the lecture", () => {
    expect(checkQuiz(quiz([question(), question("F40"), question("F03")]), blocks, 3)).toEqual([]);
  });

  it("accepts one question fewer than asked, not more", () => {
    expect(checkQuiz(quiz([question(), question()]), blocks, 3)).toEqual([]);
    expect(checkQuiz(quiz([question(), question(), question(), question()]), blocks, 3)).toContain("expected 3 questions, got 4");
  });

  it("rejects wrong counts of correct options, missing notes and unknown blocks", () => {
    const problems = checkQuiz(
      quiz([
        question("F02", [option("a", true), option("b", true), option("c"), option("d")]),
        question("F02", [option("a", true), { text: "b", correct: false, misconception: null }, option("c"), option("d")]),
        question("F99"),
      ]),
      blocks,
      3,
    );
    expect(problems).toEqual([
      "question 1 has 2 correct options, not 1",
      "question 2 has a wrong option without a misconception note",
      "question 3 cites F99, which is not a block in this lecture",
    ]);
  });

  it("accepts 'not covered' only with a reason", () => {
    expect(checkQuiz({ covered: false, notCoveredReason: "It covers the column picture instead.", questions: [] }, blocks, 5)).toEqual([]);
    expect(checkQuiz({ covered: false, notCoveredReason: null, questions: [] }, blocks, 5)).toHaveLength(1);
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
