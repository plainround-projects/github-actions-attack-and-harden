import { describe, expect, it } from "vitest";
import { main } from "../../src/interfaces/cli.js";

function run(env: Record<string, string | undefined>) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main({ env, stdout: { write: (c) => out.push(c) }, stderr: { write: (c) => err.push(c) } });
  return { code, out: out.join(""), err: err.join("") };
}

describe("main", () => {
  it("prints the greeting and exits 0", () => {
    const result = run({ ISSUE_AUTHOR: "octocat", ISSUE_TITLE: "Hello" });
    expect(result).toEqual({ code: 0, out: "New issue from octocat: Hello\n", err: "" });
  });

  it("prints a title with a quote and a command as plain text", () => {
    const result = run({ ISSUE_AUTHOR: "octocat", ISSUE_TITLE: 'x"; echo INJECTED; echo "' });
    expect(result.out).toBe('New issue from octocat: x"; echo INJECTED; echo "\n');
  });

  it("exits 2 and names the variables when one is missing", () => {
    const result = run({ ISSUE_AUTHOR: "octocat" });
    expect(result.code).toBe(2);
    expect(result.err).toContain("ISSUE_TITLE");
  });

  it("exits 1 with the reason when the issue is unusable", () => {
    const result = run({ ISSUE_AUTHOR: "bad author", ISSUE_TITLE: "Hello" });
    expect(result.code).toBe(1);
    expect(result.err).toContain("not a valid author login");
  });
});

describe("main with a failing output stream", () => {
  it("lets an error that is not a GreetingError escape instead of hiding it", () => {
    const env = { ISSUE_AUTHOR: "octocat", ISSUE_TITLE: "Hello" };
    const broken = {
      write: () => {
        throw new Error("disk full");
      },
    };
    expect(() => main({ env, stdout: broken, stderr: broken })).toThrow("disk full");
  });
});
