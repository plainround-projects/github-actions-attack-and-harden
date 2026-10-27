# 2. The OIDC subject names the environment

Status: accepted, 2026-10-27

## Context

The role's trust policy decides which workflow runs may assume it. GitHub's token carries a `sub` claim that, by default,
is `repo:OWNER/REPO:ref:refs/heads/BRANCH` for a branch, `repo:OWNER/REPO:pull_request` for a pull request, and
`repo:OWNER/REPO:environment:NAME` for a job that declares an environment. A policy with no `sub` condition trusts every
repository in the world that can reach the provider.

## Decision

`StringEquals` on `aud` (`sts.amazonaws.com`) and on `sub` equal to `repo:OWNER/REPO:environment:production`. The
module's variables reject a wildcard in the repository or the environment. The `production` environment has a required
reviewer and a rule that only `main` may deploy to it, so a job gets a token only after both.

## Alternatives considered

- **`sub` equal to the `main` branch.** Any job on `main` qualifies, with no approval, including a step added by a
  compromised dependency's update.
- **`StringLike` with `repo:OWNER/REPO:*`.** Every branch, pull request and environment of the repository qualifies.
- **Custom subject claims** (GitHub lets an organization add `job_workflow_ref` to the subject). Stronger, needs an
  organization; the next step up.

## Consequences

- Two layers must both hold: the trust policy (tested offline) and the environment's protection (set with
  `scripts/github-settings.sh`, verified on GitHub). The README's runbook checks the second by deploying from a branch.
- A second environment (`staging`) needs a second role or a `StringEquals` list; the module takes one environment on purpose.
