/**
 * A model of how AWS evaluates the trust policy of a role that GitHub's OIDC tokens assume.
 *
 * Only what the policy in infra/modules/github-oidc-role uses is supported: Allow statements for
 * sts:AssumeRoleWithWebIdentity, a federated principal, and StringEquals / StringLike conditions on the token's
 * `aud` and `sub`. Any other effect, action or operator is treated as "does not match", so the model fails closed.
 */

export interface Token {
  readonly aud: string;
  readonly sub: string;
}

type ConditionBlock = Record<string, Record<string, string | string[]>>;

export interface Statement {
  readonly Effect: string;
  readonly Action: string | string[];
  readonly Principal: { Federated?: string | string[] };
  readonly Condition?: ConditionBlock;
}

export interface TrustPolicy {
  readonly Statement: Statement[];
}

export interface Decision {
  readonly allowed: boolean;
  readonly reason: string;
}

/** `*` matches any run of characters, `?` one character, like IAM's StringLike. */
export function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

const asList = (value: string | string[]): string[] => (Array.isArray(value) ? value : [value]);

function conditionHolds(operator: string, expected: string[], actual: string): boolean {
  switch (operator) {
    case "StringEquals":
      return expected.includes(actual);
    case "StringLike":
      return expected.some((pattern) => likeToRegExp(pattern).test(actual));
    default:
      return false;
  }
}

/** Would the role be assumed by `token` (issued by `host`) through the identity provider `providerArn`? */
export function evaluate(policy: TrustPolicy, token: Token, host: string, providerArn: string): Decision {
  let lastReason = "no statement allows sts:AssumeRoleWithWebIdentity";
  for (const statement of policy.Statement) {
    if (statement.Effect !== "Allow") continue;
    if (!asList(statement.Action).includes("sts:AssumeRoleWithWebIdentity")) continue;
    if (!asList(statement.Principal.Federated ?? []).includes(providerArn)) {
      lastReason = "the token comes from a different identity provider";
      continue;
    }
    const claims: Record<string, string> = { [`${host}:aud`]: token.aud, [`${host}:sub`]: token.sub };
    let failed: string | undefined;
    for (const [operator, keys] of Object.entries(statement.Condition ?? {})) {
      for (const [key, value] of Object.entries(keys)) {
        const actual = claims[key];
        if (actual === undefined || !conditionHolds(operator, asList(value), actual)) {
          failed = `${key} ${actual === undefined ? "is not a claim" : `"${actual}"`} fails ${operator} ${JSON.stringify(value)}`;
        }
      }
    }
    if (failed === undefined) return { allowed: true, reason: "every condition holds" };
    lastReason = failed;
  }
  return { allowed: false, reason: lastReason };
}

export interface Scenario {
  readonly name: string;
  readonly token: Token;
  readonly expected: boolean;
}

/** The tokens GitHub would issue for the cases the lesson's step 5 tests, for the repository and environment given. */
export function scenarios(repository: string, environment: string): Scenario[] {
  const aud = "sts.amazonaws.com";
  return [
    {
      name: "approved deploy job in the environment",
      token: { aud, sub: `repo:${repository}:environment:${environment}` },
      expected: true,
    },
    {
      name: "same repository, a feature branch (no environment)",
      token: { aud, sub: `repo:${repository}:ref:refs/heads/feature` },
      expected: false,
    },
    {
      name: "same repository, main (no environment)",
      token: { aud, sub: `repo:${repository}:ref:refs/heads/main` },
      expected: false,
    },
    {
      name: "same repository, a pull request",
      token: { aud, sub: `repo:${repository}:pull_request` },
      expected: false,
    },
    {
      name: "same repository, another environment",
      token: { aud, sub: `repo:${repository}:environment:staging` },
      expected: false,
    },
    {
      name: "a fork's pull request",
      token: { aud, sub: `repo:someone-else/${repository.split("/")[1] ?? "repo"}:pull_request` },
      expected: false,
    },
    {
      name: "another repository, same environment name",
      token: { aud, sub: `repo:${repository}-other:environment:${environment}` },
      expected: false,
    },
    {
      name: "right subject, wrong audience",
      token: { aud: "sts.example.invalid", sub: `repo:${repository}:environment:${environment}` },
      expected: false,
    },
  ];
}
