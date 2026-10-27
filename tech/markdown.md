# Markdown and Mermaid

## What it is

Markdown is a plain-text way to write formatted documents: `#` for headings, `-` for bullets, backticks for code, `|` for tables. GitHub shows `.md` files as formatted pages. Mermaid is a text language for diagrams; GitHub draws a code block marked `mermaid` as a picture.

## Why this repository uses it

The documents are part of the product: the README with its proofs, an architecture description with a diagram, three decision records, a runbook for the real attacks, a review checklist and a changelog. Plain text reviewed in pull requests like code. One of them is also tested: the review checklist names exact lines of the lab files, and a test fails if those lines drift.

## Where it appears

| Path | What it is |
| --- | --- |
| `README.md` | Overview, how to run, the "Done when" proofs, verification status. |
| `ARCHITECTURE.md` | A components table and a Mermaid diagram. |
| `docs/adr/0001..0003-*.md` | Decision records: two workflows for fork builds, the OIDC subject names the environment, a small linter beside actionlint. |
| `docs/runbook.md` | The real attacks on GitHub, with a second account. |
| `docs/review-checklist.md` | A 19-line checklist whose references are tested. |
| `CHANGELOG.md` | Keep a Changelog format. |
| `tech/` | These notes. |

## How it works underneath

Markdown is converted to HTML by a program. The rules are simple:

- `#` at the start of a line makes a heading; more `#` means a smaller heading.
- `-` or `1.` starts a list item. A blank line must come before a list.
- Backticks make `inline code`; three backticks on their own line open and close a **code block**, and a word after the opening fence (`ts`, `bash`, `yaml`) names its language.
- `[text](address)` is a link.
- A table is rows of `|`-separated cells, with a header row followed by a line of dashes: `| --- | --- |`. `---:` right-aligns a column.
- A code block marked `mermaid` is not shown as code; GitHub draws it as a diagram. Mermaid describes boxes and arrows as text, for example `flowchart LR` for a left-to-right chart.

Because it is plain text, Git can show exactly which words changed in a pull request.

## Walkthrough of this repository's use

### A test that reads Markdown

```ts
const labReferences = [...checklist.matchAll(/`(exploit\/vulnerable\/[\w./-]+\.yml):(\d+)`/g)].map(...)
```

`tests/pipeline/checklist.test.ts` reads `docs/review-checklist.md`, finds every inline-code reference of the form `exploit/vulnerable/greet.yml:14` (the backticks are part of the pattern), and asserts that the workflow linter really reports a finding on that file and line. It also checks that all three lab files are mentioned, that every rule named in backticks exists in `RULES`, and that the checklist contains the words "pinned to a full commit SHA". The document cannot silently go stale.

### Architecture table and diagram

`ARCHITECTURE.md` has a table mapping each component of the lesson's diagram to its vulnerable file, its hardened workflow and its responsibility, and one fenced block marked `mermaid`.

### Decision records

Each ADR has the same headings: `Status`, `Context`, `Decision`, `Consequences`. ADR 0003, for example, explains why `harden-lint` exists next to actionlint: actionlint does not know this lesson's policy rules.

### Why `*.md` is in `.prettierignore`

Markdown keeps its hand-aligned tables and long lines (see `prettier.md`).

### The three decision records, in plain words

An **ADR** (architecture decision record) is a short document that records one decision and why it was made, so that nobody has to guess later.

**ADR 0001, "Build untrusted code and report on it in two workflows".** *Problem:* a fork's pull request must be built, and its author should see the result. Building is only safe where there is no secret and no write token (`pull_request`); commenting needs a write token, which `pull_request` withholds from forks; `pull_request_target` has the token but is the trigger the lab exploits. *Decision:* two workflows. `pr-build.yml` builds and uploads `result.json`; `pr-report.yml`, started by `workflow_run` from the default branch, downloads it and posts the comment. It never checks out the pull request, and `pipeline/build-result.ts` accepts only an integer pull request number, a 40-character hash and one of three words. *Alternatives it rejected:* `pull_request_target` with a checkout of the base only (safe until someone adds a step that runs the fork's files); a maintainer-added label before a privileged build (needs a person per pull request and still runs fork code with secrets); no comment at all (simplest, and what the check already shows). *Consequences:* the comment can arrive a minute late; the artifact is the only channel between the two sides and its format is tested.

**ADR 0002, "The OIDC subject names the environment".** *Problem:* the role's trust policy must decide which workflow runs may assume it, and GitHub's token `sub` claim is `repo:OWNER/REPO:ref:refs/heads/BRANCH` for a branch, `repo:OWNER/REPO:pull_request` for a pull request and `repo:OWNER/REPO:environment:NAME` for a job that declares an environment. A policy with no `sub` condition trusts every repository that can reach the provider. *Decision:* `StringEquals` on `aud` (`sts.amazonaws.com`) and on `sub` equal to `repo:OWNER/REPO:environment:production`; module variables reject wildcards; the `production` environment has a required reviewer and a rule that only `main` may deploy. *Rejected:* `sub` equal to a branch (any job on `main` qualifies without approval); `StringLike` with `repo:OWNER/REPO:*` (every branch, pull request and environment qualifies); custom subject claims (stronger, but need an organization). *Consequences:* two layers must both hold, the trust policy (tested offline) and the environment protection (set by `scripts/github-settings.sh`, checked on GitHub); a second environment would need a second role.

**ADR 0003, "A small linter beside actionlint".** *Problem:* `actionlint` checks syntax and types and flags an untrusted expression in a script, but not the lesson's other findings. *Decision:* keep both; `actionlint` first; `pipeline/harden-lint.ts` runs the eight checklist rules, with each rule tied to a lab line and a test, and exits non-zero on any finding, warnings included. *Rejected:* a broader scanner such as zizmor (a good addition, not a replacement, since the mapping from checklist to line is the deliverable); a written checklist alone (people forget, the linter does not). *Consequences:* the rules are heuristics, so a false positive is fixed the same way as a true one (move the value to `env:`); a new rule needs code, a test and a checklist row.

### The review checklist, row by row

`docs/review-checklist.md` is a table of eight questions to ask of any workflow change; columns: the question, the line of the lab that it would have caught, the linter rule that asks it automatically, and the test that proves the rule fires. (1) Does an event field reach a script through `${{ }}`? Rule `script-injection`, lab line `greet.yml:14`. (2) Does a `pull_request_target` or `workflow_run` workflow check out the pull request's code? `privileged-checkout`, `pr-build.yml:14`. (3) Is a secret in scope of a job that runs pull request code? `stored-cloud-key`, `pr-build.yml:10`. (4) Are `permissions` explicit and minimal? `missing-permissions` and `broad-permissions`, `label.yml:8`. (5) Is every action pinned to a full commit SHA with the version in a comment? `unpinned-action`, `pr-build.yml:12`. (6) Does every checkout set `persist-credentials: false`? `persist-credentials`, `pr-build.yml:14`. (7) Is a cloud key stored as a secret, or an OIDC job without an environment? `stored-cloud-key` and `oidc-without-environment`. (8) Does the environment have reviewers and a branch rule, and is the default token read-only? Not a file in the repository, so not lintable; `scripts/github-settings.sh` applies it.

### `LICENSE`, `CHANGELOG.md`, `README.md`, `ARCHITECTURE.md`

`LICENSE` is the MIT license, a short legal text that lets anyone use and change the code as long as the notice is kept. `CHANGELOG.md` lists what changed in each released version in the Keep a Changelog layout (`## [1.0.0] - date`, then `### Added`). `README.md` is the front page: purpose, prerequisites, commands, the proof for each "Done when" line, the file layout and the verification status. `ARCHITECTURE.md` explains the parts, with a component table and one Mermaid diagram.

## Try it yourself

1. `npx vitest run tests/pipeline/checklist.test.ts` runs the test that reads the checklist.
2. `grep -n '^## ' README.md` lists the README's sections.
3. `grep -c '```mermaid' ARCHITECTURE.md` prints `1`.
4. Change a line number in `docs/review-checklist.md` (for example `greet.yml:14` to `:15`), rerun the test, watch it fail, then `git checkout docs/review-checklist.md`.
5. `head -12 CHANGELOG.md` shows the Keep a Changelog layout.

## Mistakes people make

- A table row with a different number of cells than the header.
- Forgetting the blank line before a list or table, so it shows as plain text.
- A code fence that is never closed, which swallows the rest of the page.
- Documents that describe the code from memory instead of being checked against it.

## Check yourself

1. How does GitHub draw a diagram from text? *(A `mermaid` fenced block is rendered by Mermaid.)*
2. What does `---:` do in a table? *(Right-aligns the column.)*
3. What does `checklist.test.ts` check? *(That each file and line named in the checklist is really reported by the linter, and that every rule named exists.)*
4. What starts and ends a code block? *(Three backticks.)*
5. What does an ADR record? *(A decision, its context and its consequences.)*

## Further reading

- GitHub Flavored Markdown spec: https://github.github.com/gfm/
- Mermaid: https://mermaid.js.org/intro/
- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- Architecture decision records: https://adr.github.io/
