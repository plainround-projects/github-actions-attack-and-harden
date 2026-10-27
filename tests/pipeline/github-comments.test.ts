import { describe, expect, it } from "vitest";
import { COMMENT_MARKER } from "../../pipeline/build-result.js";
import { GitHubComments, HttpError, upsertComment, type Comments } from "../../pipeline/github-comments.js";

class Fake implements Comments {
  readonly calls: string[] = [];
  constructor(private readonly existing: { id: number; body: string }[]) {}
  async list() {
    return this.existing;
  }
  async create(_repo: string, pr: number, body: string) {
    this.calls.push(`create ${pr} ${body}`);
  }
  async update(_repo: string, id: number, body: string) {
    this.calls.push(`update ${id} ${body}`);
  }
}

describe("upsertComment", () => {
  it("creates the comment when none of ours exists", async () => {
    const api = new Fake([{ id: 1, body: "someone else's comment" }]);
    expect(await upsertComment(api, "o/r", 5, `${COMMENT_MARKER}\nhi`)).toBe("created");
    expect(api.calls).toEqual([`create 5 ${COMMENT_MARKER}\nhi`]);
  });

  it("updates our earlier comment instead of adding another", async () => {
    const api = new Fake([{ id: 9, body: `${COMMENT_MARKER}\nold` }]);
    expect(await upsertComment(api, "o/r", 5, `${COMMENT_MARKER}\nnew`)).toBe("updated");
    expect(api.calls).toEqual([`update 9 ${COMMENT_MARKER}\nnew`]);
  });

  it("refuses a repository name that is not owner/name", async () => {
    await expect(upsertComment(new Fake([]), "o/r/../../x", 5, "b")).rejects.toThrow(/not a repository name/);
  });
});

function answers(...statuses: (number | Error)[]): { fetchFn: typeof fetch; seen: string[] } {
  const seen: string[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    seen.push(`${init?.method} ${url}`);
    const next = statuses.shift();
    if (next instanceof Error) throw next;
    const status = next ?? 200;
    return new Response(status === 200 ? "[]" : "no", { status });
  }) as unknown as typeof fetch;
  return { fetchFn, seen };
}

const noSleep = async () => {};

describe("GitHubComments", () => {
  it("sends the token, lists comments and posts a new one", async () => {
    const { fetchFn, seen } = answers(200, 200);
    const api = new GitHubComments({ token: "t", fetchFn, sleep: noSleep });
    expect(await api.list("o/r", 3)).toEqual([]);
    await api.create("o/r", 3, "body");
    expect(seen).toEqual([
      "GET https://api.github.com/repos/o/r/issues/3/comments?per_page=100",
      "POST https://api.github.com/repos/o/r/issues/3/comments",
    ]);
  });

  it("updates a comment with PATCH", async () => {
    const { fetchFn, seen } = answers(200);
    await new GitHubComments({ token: "t", fetchFn, sleep: noSleep }).update("o/r", 77, "b");
    expect(seen).toEqual(["PATCH https://api.github.com/repos/o/r/issues/comments/77"]);
  });

  it("retries a 503 and a network error, then succeeds", async () => {
    const { fetchFn, seen } = answers(503, new Error("socket hang up"), 200);
    const sleeps: number[] = [];
    const api = new GitHubComments({ token: "t", fetchFn, sleep: async (ms) => void sleeps.push(ms) });
    await api.create("o/r", 1, "b");
    expect(seen).toHaveLength(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it("does not retry a 4xx", async () => {
    const { fetchFn, seen } = answers(403);
    const api = new GitHubComments({ token: "t", fetchFn, sleep: noSleep });
    await expect(api.create("o/r", 1, "b")).rejects.toBeInstanceOf(HttpError);
    expect(seen).toHaveLength(1);
  });

  it("gives up after the last attempt and reports the last error", async () => {
    const { fetchFn, seen } = answers(500, 500, 502);
    const api = new GitHubComments({ token: "t", fetchFn, sleep: noSleep, attempts: 3 });
    await expect(api.create("o/r", 1, "b")).rejects.toThrow(/502/);
    expect(seen).toHaveLength(3);
  });
});
