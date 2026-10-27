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
