import { describe, expect, it } from "vitest";
import { evaluate, likeToRegExp, scenarios, type TrustPolicy } from "../../pipeline/trust-policy.js";

const HOST = "token.actions.githubusercontent.com";
const PROVIDER = `arn:aws:iam::123456789012:oidc-provider/${HOST}`;
const REPO = "owner/vulnerable-demo";

const policy = (condition: TrustPolicy["Statement"][number]["Condition"]): TrustPolicy => ({
  Statement: [
    {
      Effect: "Allow",
      Action: "sts:AssumeRoleWithWebIdentity",
      Principal: { Federated: PROVIDER },
      ...(condition ? { Condition: condition } : {}),
    },
  ],
});

const scoped = policy({
  StringEquals: {
    [`${HOST}:aud`]: "sts.amazonaws.com",
    [`${HOST}:sub`]: `repo:${REPO}:environment:production`,
  },
});

describe("likeToRegExp", () => {
  it("treats * and ? as wildcards and everything else literally", () => {
    expect(likeToRegExp("repo:o/r:*").test("repo:o/r:environment:production")).toBe(true);
    expect(likeToRegExp("a?c").test("abc")).toBe(true);
    expect(likeToRegExp("a.c").test("abc")).toBe(false);
  });
});

describe("evaluate", () => {
  it("lets the approved deploy job in", () => {
    const decision = evaluate(
      scoped,
      { aud: "sts.amazonaws.com", sub: `repo:${REPO}:environment:production` },
      HOST,
      PROVIDER,
    );
    expect(decision).toEqual({ allowed: true, reason: "every condition holds" });
  });

  it("refuses another subject and says which condition failed", () => {
    const decision = evaluate(
      scoped,
      { aud: "sts.amazonaws.com", sub: `repo:${REPO}:ref:refs/heads/x` },
      HOST,
      PROVIDER,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain(`${HOST}:sub`);
  });

  it("refuses another provider", () => {
    const decision = evaluate(
      scoped,
      { aud: "sts.amazonaws.com", sub: `repo:${REPO}:environment:production` },
      HOST,
      "arn:other",
    );
    expect(decision).toEqual({ allowed: false, reason: "the token comes from a different identity provider" });
  });

  it("a policy with no condition trusts every repository, which is the mistake the lesson warns about", () => {
    const open = policy(undefined);
    expect(evaluate(open, { aud: "x", sub: "repo:anyone/anything:pull_request" }, HOST, PROVIDER).allowed).toBe(true);
  });

  it("supports StringLike and fails closed on an operator it does not know", () => {
    const like = policy({ StringLike: { [`${HOST}:sub`]: `repo:${REPO}:*` } });
    expect(evaluate(like, { aud: "x", sub: `repo:${REPO}:ref:refs/heads/main` }, HOST, PROVIDER).allowed).toBe(true);
    const unknown = policy({ ForAnyValue: { [`${HOST}:sub`]: "x" } });
    expect(evaluate(unknown, { aud: "x", sub: "x" }, HOST, PROVIDER).allowed).toBe(false);
  });

  it("fails closed on a condition key that is not a claim, and on a non-Allow or non-AssumeRole statement", () => {
    const strange = policy({ StringEquals: { "other:key": "x" } });
    expect(evaluate(strange, { aud: "x", sub: "x" }, HOST, PROVIDER).reason).toContain("is not a claim");
    const deny: TrustPolicy = { Statement: [{ Effect: "Deny", Action: "*", Principal: {} }] };
    expect(evaluate(deny, { aud: "x", sub: "x" }, HOST, PROVIDER).allowed).toBe(false);
    const wrongAction: TrustPolicy = { Statement: [{ Effect: "Allow", Action: "s3:*", Principal: {} }] };
    expect(evaluate(wrongAction, { aud: "x", sub: "x" }, HOST, PROVIDER).allowed).toBe(false);
  });

  it("accepts a list of allowed subjects as alternatives", () => {
    const either = policy({ StringEquals: { [`${HOST}:sub`]: ["a", "b"] } });
    expect(evaluate(either, { aud: "x", sub: "b" }, HOST, PROVIDER).allowed).toBe(true);
    expect(evaluate(either, { aud: "x", sub: "c" }, HOST, PROVIDER).allowed).toBe(false);
  });
});

describe("scenarios against the scoped policy", () => {
  it("lets exactly one in: the approved job in the production environment", () => {
    const results = scenarios(REPO, "production").map((s) => [
      s.name,
      evaluate(scoped, s.token, HOST, PROVIDER).allowed,
      s.expected,
    ]);
    for (const [, allowed, expected] of results) expect(allowed).toBe(expected);
    expect(results.filter(([, allowed]) => allowed)).toHaveLength(1);
  });
});
