# 3. A small linter beside actionlint

Status: accepted, 2026-10-27

## Context

`actionlint` is the standard checker for workflow syntax and types. It also flags an untrusted expression inside an inline
script. It does not know the lesson's other findings: a privileged trigger that checks out the pull request, a missing
`permissions` block, an unpinned action, a stored cloud key.

## Decision

Keep both. `actionlint` runs first and fails the build on any syntax or type problem. `pipeline/harden-lint.ts` runs the
lesson's review checklist as eight rules, each with the lab line it catches and a test (`docs/review-checklist.md`). It
exits non-zero on any finding, warnings included, so the repository's own workflows must lint clean.

## Alternatives considered

- **zizmor or another security scanner.** Broader and maintained by others; a good addition (the lesson's first stretch).
  Not a replacement here because the checklist-to-line mapping is the deliverable.
- **Only a written checklist.** Reviewers forget; the linter does not.

## Consequences

- The rules are heuristics: `script-injection` flags any `github.event.*` or `github.head_ref` inside a `run:` expression
  except a few numeric fields; a false positive is fixed the same way as a true one (move it to `env:`).
- A new rule is a code change with a test and a row in the checklist.
