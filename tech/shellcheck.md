# ShellCheck

## What it is

ShellCheck is a static analyzer for shell scripts. It reads a script without running it and warns about common mistakes: unquoted variables, commands that may not do what they look like, features that your shell does not have. Each warning has a code such as `SC2086`. This repository uses version 0.11.0.

## Why this repository uses it

This repository has shell scripts that change repository settings and handle names and refs, so quoting mistakes matter. ShellCheck is the tool that spots them. Be precise about how it is wired in here: `make lint` does **not** run `shellcheck` on `scripts/*.sh` directly. ShellCheck reaches the repository in two ways: `actionlint` calls it (when it is on the `PATH`) to check the shell code inside workflow `run:` blocks, and it is installed in the `act` runner image. Running it on the scripts by hand is clean (see below).

## Where it appears

| Path | Role |
| --- | --- |
| `.github/workflows/*.yml` `run:` blocks | Checked by actionlint through ShellCheck on GitHub's runners, which have it installed. |
| `ci/act-runner/Dockerfile` | Installs the `shellcheck` package so actionlint can use it inside the image. |
| `scripts/*.sh` | Not part of `make lint`; run `shellcheck scripts/*.sh` yourself. |

## How it works underneath

ShellCheck parses the script into the same kind of tree that Bash builds, then applies a long list of rules to it. It reads the shebang line (`#!/usr/bin/env bash`) to know which shell to assume. `-e`-style behaviors are not run; it only reasons about the text.

## Walkthrough of this repository's use

```bash
shellcheck scripts/*.sh
```

The glob expands to the four scripts. A clean run prints nothing and exits 0. What it checks in these scripts, and what they do to pass: variables are quoted (`"$repo"`, `"$logs/attack1.log"`); `[[ ... ]]` is used for tests; `read`-style pitfalls are avoided; `"${act_flags[@]}"` expands an array properly; `local` is used inside functions; the here-document marker is spelled consistently.

For a workflow, ShellCheck sees only the script text of a `run:` block. GitHub expressions are replaced by a placeholder first, so it checks the surrounding shell:

```yaml
run: aws s3 sync dist "s3://${BUCKET}/releases/${GITHUB_SHA}/" --no-progress
```

The quotes around the destination and the use of `${BUCKET}` from `env:` are what ShellCheck wants. The lab file's `echo "New issue: ${{ ... }}"` is not a ShellCheck problem at all; it is a GitHub-expression problem, which actionlint's own check reports.

## Try it yourself

1. `shellcheck --version` shows `version: 0.11.0` among its lines.
2. `shellcheck scripts/*.sh; echo $?` prints `0`.
3. `printf '#!/bin/bash\necho $1\n' > /tmp/s.sh && shellcheck /tmp/s.sh` reports `SC2086` (double quote to prevent globbing and word splitting).
4. `shellcheck -f gcc scripts/lab.sh` prints findings in compiler style (none).
5. `which shellcheck` shows whether actionlint can use it on your machine.

## Mistakes people make

- Assuming `make lint` covers the scripts (it does not here).
- Disabling a rule globally to make noise stop.
- Writing `#!/bin/sh` but using Bash-only features such as arrays or `declare -A`.
- Forgetting ShellCheck cannot see inside `${{ }}` expressions.

## Check yourself

1. What does it analyze? *(The text of shell scripts, without running them.)*
2. What does `SC2086` warn about? *(An unquoted variable that can be split into several words.)*
3. How does it reach the workflows here? *(actionlint runs it on `run:` blocks.)*
4. Does `make lint` run it on `scripts/`? *(No; run it by hand.)*
5. How do you silence one finding? *(A `# shellcheck disable=SCxxxx` comment above the line.)*

## Further reading

- ShellCheck wiki (0.11): https://www.shellcheck.net/wiki/
