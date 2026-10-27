# 1. Build untrusted code and report on it in two workflows

Status: accepted, 2026-10-27

## Context

A pull request from a fork must be built, and its author should see the result as a comment. Building is safe only where
no secret and no write token exists (`pull_request`). Commenting needs a write token, which `pull_request` withholds from
forks. `pull_request_target` has the token but is the trigger the lab exploits.

## Decision

Two workflows. `pr-build.yml` (`pull_request`) builds and tests and uploads `result.json`. `pr-report.yml` (`workflow_run`,
which GitHub starts from the default branch) downloads that artifact and posts the comment. The report workflow never
checks out the pull request and treats the artifact as hostile: `pipeline/build-result.ts` accepts only an integer pull
request number, a 40-hex hash and one of three words, and rejects extra fields.

## Alternatives considered

- **`pull_request_target` with a checkout of the base branch only.** Safe if nobody ever adds a step that runs the fork's
  files, which is the mistake the lab shows; it does not build the fork at all.
- **A label that a maintainer adds before a privileged build runs.** Works, needs a human per pull request and still
  runs fork code with secrets once approved.
- **No comment; read the check.** The simplest and fine for a small project. Chosen for the build result of `pr-build`
  itself (the check shows it); the comment is the lesson's optional path.

## Consequences

- The comment can appear a minute after the check; the two workflows are linked only by the artifact name.
- The artifact is the only channel from the unprivileged side to the privileged side, and its schema is tested.
