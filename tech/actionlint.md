# actionlint

## What it is

actionlint is a command-line checker for GitHub Actions workflow files. Like a spell-checker for workflows, it reads the YAML and reports mistakes: unknown keys, wrong types, bad `${{ }}` expressions, undefined job names in `needs`, and (with ShellCheck installed) problems inside `run:` scripts. This repository uses version 1.7.12.

## Why this repository uses it

It finds workflow mistakes before a push, and it knows the lesson's first attack: it reports an event field that reaches a script through `${{ }}` as "potentially untrusted". The repository runs it beside its own `harden-lint` (ADR 0003 explains why both: actionlint finds mistakes in syntax, types and shell; `harden-lint` encodes this lesson's rules, such as missing `permissions` and unpinned actions).

## Where it appears

| Path | What it does with actionlint |
| --- | --- |
| `Makefile` | `lint` runs `actionlint`; `attack-scan` runs it on `exploit/vulnerable/.github/workflows/*.yml` and expects findings. |
| `.github/workflows/ci.yml` | Job `workflows` installs a pinned binary with `scripts/install-actionlint.sh`, adds it to the path and runs `actionlint`. |
| `scripts/install-actionlint.sh` | Downloads release 1.7.12 for Linux amd64 or arm64 and verifies its SHA-256. |
| `docs/adr/0003-harden-lint-beside-actionlint.md` | The decision record. |

## How it works underneath

actionlint parses each workflow file into a tree, then checks it in layers: the YAML shape, then the syntax of every `${{ }}` expression, then the types (`matrix.os` exists only if the matrix defines `os`), then the context rules (`needs.lint.result` is valid only when the job needs `lint`). For each `run:` step it passes the script to ShellCheck (`shellcheck.md`) if that program is on the `PATH`. It does not contact GitHub, so it cannot know whether a remote action exists.

## Walkthrough of this repository's use

```bash
actionlint
```

With no arguments it checks every file in `.github/workflows/`. Silence and exit code 0 mean no findings. It checks, among other things, that expressions refer to real contexts and fields, that `needs:` names exist, that `with:` inputs of well-known actions exist and have the right types, and (through ShellCheck, when installed) the shell code in `run:` blocks.

On the weak lab workflow:

```text
exploit/vulnerable/.github/workflows/greet.yml:14:35: "github.event.issue.title" is potentially untrusted. avoid using it directly in inline scripts. instead, pass it through an environment variable. ... [expression]
```

`file:line:column: message [kind]`. This is exactly attack 1 and exactly the fix the hardened `greet.yml` applies. What actionlint does **not** report on the lab files: the missing `permissions` block, the unpinned `actions/checkout@v4`, the `pull_request_target` checkout of the pull request, or the stored `DEPLOY_TOKEN`. Those are policy, not syntax, so `pipeline/harden-lint.ts` covers them (`npx tsx pipeline/harden-lint-cli.ts exploit/vulnerable/.github/workflows` finds eight).

In `ci.yml`:

```yaml
- run: scripts/install-actionlint.sh
- run: echo "$PWD/.tools/bin" >> "$GITHUB_PATH"
- run: actionlint
- run: npx tsx pipeline/harden-lint-cli.ts
```

The installer puts the binary in `.tools/bin` (ignored by git). Appending to `$GITHUB_PATH` makes it findable by the later steps. `make attack-scan` puts a `-` before the command because findings are the expected outcome there.

## Try it yourself

1. `actionlint -version` prints `1.7.12` first.
2. `actionlint; echo $?` prints `0`.
3. `actionlint exploit/vulnerable/.github/workflows/*.yml; echo $?` prints the `potentially untrusted` finding and `1`.
4. `actionlint -format '{{json .}}' exploit/vulnerable/.github/workflows/greet.yml` prints the finding as JSON.
5. `make attack-scan` runs both linters on the lab and still succeeds.

## Mistakes people make

- Believing a clean actionlint run means the workflow is safe. It does not judge permissions, pinning or which trigger is dangerous.
- Believing it contacts GitHub. It reads files only.
- Running a different actionlint version locally and in CI (the installer pins one).
- Having no ShellCheck on the machine, which silently drops the script checks.

## Check yourself

1. What does actionlint read? *(Workflow YAML files.)*
2. Which attack does it catch in the lab? *(Attack 1, the untrusted `github.event.issue.title` in a script.)*
3. What does it miss that `harden-lint` finds? *(Missing permissions, unpinned actions, privileged checkout, stored keys.)*
4. How does CI get the binary? *(`scripts/install-actionlint.sh` downloads a pinned release and verifies the checksum.)*
5. Why does `make attack-scan` start the line with `-`? *(The linters are expected to fail on the lab files.)*

## Further reading

- actionlint 1.7 documentation: https://github.com/rhysd/actionlint/blob/v1.7.12/docs/usage.md
- Checks reference: https://github.com/rhysd/actionlint/blob/v1.7.12/docs/checks.md
