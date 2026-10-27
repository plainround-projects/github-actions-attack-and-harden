import { describe, expect, it } from "vitest";
import { COMMENT_MARKER, InvalidResultError, parseResult, renderComment } from "../../pipeline/build-result.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const valid = JSON.stringify({ pr: 12, sha: SHA, conclusion: "failure" });

describe("parseResult", () => {
  it("accepts the three fields it expects", () => {
    expect(parseResult(valid)).toEqual({ pr: 12, sha: SHA, conclusion: "failure" });
  });

  it.each([
    ["text that is not JSON", "not json"],
    ["a JSON array", "[]"],
    ["null", "null"],
    ["a pull request number as text", JSON.stringify({ pr: "12", sha: SHA, conclusion: "success" })],
    ["a negative pull request number", JSON.stringify({ pr: -1, sha: SHA, conclusion: "success" })],
    ["a fractional pull request number", JSON.stringify({ pr: 1.5, sha: SHA, conclusion: "success" })],
    ["a huge pull request number", JSON.stringify({ pr: 1e12, sha: SHA, conclusion: "success" })],
    ["a short hash", JSON.stringify({ pr: 1, sha: "abc", conclusion: "success" })],
    ["an upper-case hash", JSON.stringify({ pr: 1, sha: SHA.toUpperCase(), conclusion: "success" })],
    ["a conclusion with a payload", JSON.stringify({ pr: 1, sha: SHA, conclusion: "success\n@everyone" })],
    ["an extra field", JSON.stringify({ pr: 1, sha: SHA, conclusion: "success", body: "x" })],
  ])("rejects %s", (_name, text) => {
    expect(() => parseResult(text)).toThrow(InvalidResultError);
  });
});

describe("renderComment", () => {
  it.each([
    ["success", "passed"],
    ["failure", "failed"],
    ["cancelled", "was cancelled"],
  ] as const)("says what happened for %s", (conclusion, words) => {
    const body = renderComment({ pr: 1, sha: SHA, conclusion });
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain(`\`0123456\` ${words}.`);
  });
});
