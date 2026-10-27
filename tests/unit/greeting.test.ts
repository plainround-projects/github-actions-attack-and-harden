import { describe, expect, it } from "vitest";
import { GreetingError } from "../../src/domain/errors.js";
import { MAX_TITLE_LENGTH, createGreeting, renderGreeting, sanitizeTitle } from "../../src/domain/greeting.js";

describe("sanitizeTitle", () => {
  it("keeps an ordinary title as it is", () => {
    expect(sanitizeTitle("Build fails on Windows")).toBe("Build fails on Windows");
  });

  it("turns line breaks and control characters into single spaces", () => {
    expect(sanitizeTitle("one\r\ntwo\u0000\u001b[31mthree")).toBe("one two [31mthree");
  });

  it("leaves shell metacharacters alone because they are only ever printed", () => {
    expect(sanitizeTitle('x"; echo hi; echo "')).toBe('x"; echo hi; echo "');
  });

  it("cuts a long title with an ellipsis at the limit", () => {
    const cut = sanitizeTitle("a".repeat(500));
    expect(cut).toHaveLength(MAX_TITLE_LENGTH);
    expect(cut.endsWith("…")).toBe(true);
  });
});

describe("createGreeting", () => {
  it("builds an immutable greeting from a login and a title", () => {
    expect(createGreeting("octocat", "  Hello  ")).toEqual({ author: "octocat", title: "Hello" });
  });

  it.each(["", "-leading", "has space", "a".repeat(40), "semi;colon", "$(id)"])("rejects the author %j", (author) => {
    expect(() => createGreeting(author, "Hello")).toThrow(GreetingError);
  });

  it("rejects a title that is empty once cleaned", () => {
    expect(() => createGreeting("octocat", " \n\t ")).toThrow(/empty/);
  });
});

describe("renderGreeting", () => {
  it("prints the author and the title on one line", () => {
    expect(renderGreeting({ author: "octocat", title: "Hello" })).toBe("New issue from octocat: Hello");
  });
});
