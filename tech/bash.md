# Bash

## What it is

Bash is a **shell**: a program that reads commands and runs them. A file of commands is a **shell script**. Bash is the normal shell on Linux and macOS, and GitHub's runners (including Windows ones, through Git Bash) have it, so workflow steps here set `shell: bash`.

## Why this repository uses it

The scripts that run the lab, change repository settings, publish variables and install a checked tool are Bash. Bash also appears inside the workflows (`run:` blocks) and the Makefile recipes. These are exactly the places where the lesson's first attack lives: shell code built from text a stranger typed.

## Where it appears

| Path | What it does |
| --- | --- |
| `scripts/lab.sh` | Runs attacks 1 and 2 and fixes 1 and 2 with `act`, and checks each result. |
| `scripts/github-settings.sh` | Applies repository settings with `gh`; has a dry-run mode. |
| `scripts/set-variables.sh` | Copies Terraform outputs to repository variables. |
| `scripts/install-actionlint.sh` | Downloads a pinned actionlint and verifies its checksum. |
| `.github/workflows/*.yml` | `run:` steps: `echo`, `jq`, `aws s3 sync`, `npm`. |
| `Makefile` | Each recipe line is run by a shell. |
| `ci/act-runner/Dockerfile` | `RUN` lines are shell commands (`case`, `curl`, `tar`). |

## How it works underneath

The first line `#!/usr/bin/env bash` (the **shebang**) tells the operating system which program runs the file. Bash reads line by line. Each command is a **process** that ends with an **exit code**: 0 is success, anything else is failure, and `$?` holds the last one. A **pipe** `a | b` sends the output of `a` into `b`. **Standard output** carries results, **standard error** carries messages; `>` redirects a stream to a file, `2>&1` joins error to output. Always quote variables (`"$x"`) so spaces do not split them.

## Walkthrough of this repository's use

### The safety header

```bash
#!/usr/bin/env bash
set -euo pipefail
```

The first line (the **shebang**) says which program runs the file; `env bash` finds Bash on the `PATH`. `set -e` stops the script at the first failing command, `-u` makes an unset variable an error, and `-o pipefail` makes a pipeline fail if any part of it fails (otherwise only the last command's status counts). All four scripts start this way.

### Required arguments and checks (`github-settings.sh`)

```bash
repo="${1:?usage: scripts/github-settings.sh OWNER/REPO REVIEWER_LOGIN}"
if [[ ! "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "github-settings: '$repo' is not OWNER/REPO" >&2
  exit 2
fi
```

`${1:?message}` stops with the message if the first argument is missing. `[[ ... =~ regex ]]` tests a regular expression; `!` negates it. The argument ends up in URLs, so it is checked first. `>&2` sends the message to stderr. `exit 2` is the code for "wrong usage".

### A function with a dry-run switch

```bash
gh_api() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf 'gh api'
    printf ' %q' "$@"
    printf '\n'
  else
    gh api "$@"
  fi
}
```

`${DRY_RUN:-0}` is the variable, or `0` if unset. `"$@"` is every argument, each kept whole. `printf ' %q'` prints each argument quoted so it could be pasted into a shell. So `DRY_RUN=1 scripts/github-settings.sh owner/repo octocat` shows the commands and changes nothing.

### A here-document

```bash
gh api -X PUT "repos/$repo/environments/production" --input - <<JSON
{
  "wait_timer": 0,
  "reviewers": [{ "type": "User", "id": $reviewer_id }],
  ...
}
JSON
```

`<<JSON` feeds the lines up to the line `JSON` into the command's standard input. Because `JSON` is not quoted, `$reviewer_id` is replaced inside. `--input -` tells `gh` to read the body from standard input. The id comes from `gh api "users/$reviewer" --jq .id`, a number.

### Helper functions (`lab.sh`)

```bash
run() {
  local log="$1"
  shift
  if ! act "${act_flags[@]}" "$@" >"$log" 2>&1; then
    ...
  fi
}

expect() {
  if grep -Eq "$2" "$1"; then
    printf 'ok   %s\n' "$3"
  else
    printf 'FAIL expected: %s\n' "$3" >&2
    exit 1
  fi
}
```

`local` keeps a variable inside the function. `shift` drops the first argument so `"$@"` is the rest. `act_flags` is an **array** (`act_flags=(--concurrent-jobs 1)`), and `"${act_flags[@]}"` expands to its elements as separate words. `>"$log" 2>&1` sends both output streams to the log file. `grep -Eq` searches with an extended regular expression and prints nothing (`-q`); its exit status is the answer. If the log contains `Job succeeded` and not `Job failed`, a Docker clean-up error after the job is tolerated.

The checks themselves read like sentences: `expect "$logs/attack1.log" '\| INJECTED-COMMAND-RAN$' "the injected command ran as a line of its own"` passes only if a log line is exactly `| INJECTED-COMMAND-RAN` (act prefixes step output with `| `). `expect_none` asserts the opposite for the fix.

### Finding the repository root and preparing the lab copy

```bash
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
...
git ls-files -z | xargs -0 -I{} rsync -aR "{}" "$logs/fork-hardened/"
```

`$0` is the script's own path; `dirname` strips the file name; `..` goes up one; `pwd` prints the absolute result, so the script works from any folder. `git ls-files -z` lists tracked files separated by NUL characters (safe for odd names); `xargs -0 -I{}` runs `rsync -aR` once per file, copying it with its folder path. The result is a copy of exactly the tracked files, with no `node_modules`.

### Verified download (`install-actionlint.sh`)

```bash
declare -A SUMS=( [linux_amd64]="8aca8db96f1b..." [linux_arm64]="325e971b6ba9..." )
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)  platform="linux_amd64" ;;
  Linux-aarch64) platform="linux_arm64" ;;
  *) echo "unsupported" >&2; exit 1 ;;
esac
archive="$(mktemp)"
trap 'rm -f "$archive"' EXIT
curl --fail --silent --show-error --location --retry 3 "https://github.com/rhysd/actionlint/releases/download/v${VERSION}/actionlint_${VERSION}_${platform}.tar.gz" -o "$archive"
echo "${SUMS[$platform]}  $archive" | sha256sum --check --status || { echo "checksum mismatch" >&2; exit 1; }
tar -xzf "$archive" -C "$dest" actionlint
```

`declare -A` makes an associative array (a dictionary; Bash 4 or newer, so the script is for Linux, not the Mac's old Bash 3.2). `case` picks the platform from the operating system and CPU names. `mktemp` makes a temporary file and `trap '...' EXIT` deletes it however the script ends. The `curl` flags: `--fail` (an HTTP error becomes an error exit), `--silent --show-error` (quiet but still show errors), `--location` (follow redirects), `--retry 3`. `sha256sum --check` compares the file against the recorded hash; only then is it unpacked. This is the same idea as pinning an action to a SHA, applied to a downloaded tool.

### Inline shell in workflows

```bash
echo "$PWD/.tools/bin" >> "$GITHUB_PATH"
aws s3 sync dist "s3://${BUCKET}/releases/${GITHUB_SHA}/" --no-progress
jq -n --argjson pr "$PR_NUMBER" --arg sha "$HEAD_SHA" --arg conclusion "$JOB_STATUS" '{...}' > result.json
```

Appending a directory to the file `$GITHUB_PATH` adds it to the `PATH` of later steps. Every variable is quoted. Values from the event reach the script only as environment variables (`BUCKET`, `PR_NUMBER`, `HEAD_SHA`, `JOB_STATUS`), never as `${{ }}` text.

### `scripts/lab.sh`, the rest of it

The top of the script (after the header explained above):

```bash
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
logs="$root/build/lab"
rm -rf "$logs"
mkdir -p "$logs"
fake_secret="DEPLOY_TOKEN=demo-not-a-real-secret"
pinned_upload="$(grep -o 'actions/upload-artifact@[0-9a-f]\{40\}' .github/workflows/pr-build.yml | head -1)"
upload_stub="$root/exploit/stubs/upload-artifact"
checkout_stub="$root/exploit/stubs/fork-checkout"
act_flags=(--concurrent-jobs 1)
```

- `$(...)` runs a command and uses its output as text. `$0` is the script's own path. `dirname` removes the file name; `cd` moves there; `&&` runs the next command only if the previous one succeeded; `pwd` prints the full path. So `root` is the repository's absolute path wherever the script is started from. `cd "$root"` makes it the current folder.
- `rm -rf "$logs"` deletes the previous run's folder (`-r` folders, `-f` no complaints if missing); `mkdir -p` creates it (and any parents).
- `fake_secret` is a made-up secret with a name that says so.
- `grep -o PATTERN FILE` prints only the matching part; the pattern is `actions/upload-artifact@` followed by exactly 40 hexadecimal characters (`\{40\}`). `head -1` keeps the first line. The result is the exact pinned reference the hardened workflow uses, so it can be swapped for a stand-in later.
- `act_flags=(--concurrent-jobs 1)` is an array: a list of words kept separate (see `act.md` for the flag).

The four blocks, each announced with `echo "== ..."`:

```bash
echo "== attack 1: script injection through an issue title (vulnerable greet.yml)"
run "$logs/attack1.log" issues -C exploit/vulnerable -W .github/workflows/greet.yml -e "$root/exploit/events/issue-injection.json"
grep -E "\| (New issue|INJECTED)" "$logs/attack1.log" | sed 's/^/   /'
expect "$logs/attack1.log" '\| INJECTED-COMMAND-RAN$' "the injected command ran as a line of its own"
```

`run LOG ARGS...` runs `act` (the function was explained above). `grep -E` with `\|` searches for the literal text `| New issue` or `| INJECTED` (act prefixes the output of each step line with `| `); `|` between commands is a **pipe**: the output of `grep` becomes the input of `sed`, and `sed 's/^/   /'` adds three spaces at the start of each line (`s/pattern/replacement/`; `^` is "start of line"). Then `expect` asserts that a line ends in exactly `| INJECTED-COMMAND-RAN` (`$` is "end of line").

```bash
echo "== fix 1: the same title through an environment variable (hardened greet.yml)"
run "$logs/fix1.log" issues -W .github/workflows/greet.yml -e "$root/exploit/events/issue-injection.json"
grep -E "\| New issue" "$logs/fix1.log" | sed 's/^/   /'
expect_none "$logs/fix1.log" '\| INJECTED-COMMAND-RAN$' "the title printed as text and no command ran"
```

The same event on the hardened workflow. `expect_none` (the opposite of `expect`) passes only if no line matches.

```bash
echo "== attack 2: ..."
mkdir -p "$logs/fork-vulnerable"
cp -R exploit/vulnerable/. "$logs/fork-vulnerable/"
node exploit/fork/apply-fork-change.mjs "$logs/fork-vulnerable/package.json"
run "$logs/attack2.log" pull_request_target -b -C "$logs/fork-vulnerable" -W .github/workflows/pr-build.yml \
  -e "$root/exploit/events/pull-request-from-fork.json" --local-repository "actions/checkout@v4=$checkout_stub" -s "$fake_secret"
grep -E "\| FORK CODE RAN" "$logs/attack2.log" | sed 's/^/   /'
expect "$logs/attack2.log" '\| FORK CODE RAN: event=pull_request_target deploy-token-in-environment=true$' \
  "the fork's build script ran with DEPLOY_TOKEN in its environment"
```

`cp -R SRC/. DEST/` copies a folder's contents, including hidden files like `.github`. `node ...apply-fork-change.mjs` rewrites the copy's `package.json` so its `build` script is the "fork's change" (see `node.md`). The `act` command is explained in `act.md`. A line ending in `\` continues on the next line.

```bash
echo "== fix 2: ..."
mkdir -p "$logs/fork-hardened"
git ls-files -z | xargs -0 -I{} rsync -aR "{}" "$logs/fork-hardened/"
node exploit/fork/apply-fork-change.mjs "$logs/fork-hardened/package.json"
run "$logs/fix2.log" pull_request -C "$logs/fork-hardened" -W .github/workflows/pr-build.yml \
  -e "$root/exploit/events/pull-request-from-fork.json" --local-repository "$pinned_upload=$upload_stub"
...
expect "$logs/fix2.log" '\| FORK CODE RAN: event=pull_request deploy-token-in-environment=false$' ...
expect "$logs/fix2.log" '\| artifact build-result: result.json' "the result file was recorded for pr-report"
echo "lab: every attack worked on the vulnerable workflow and every fix held"
```

`git ls-files -z` lists tracked files separated by NUL characters; `xargs -0 -I{} CMD` runs `CMD` once per name with `{}` replaced by it; `rsync -aR` copies a file keeping its folder path (`-a` preserves permissions and times, `-R` keeps the relative path). Two expectations for the fix: the fork's code still runs, but with no `DEPLOY_TOKEN` in its environment, and the result file is recorded. The final `echo` is reached only if every `expect` passed, because `set -e` and `exit 1` stop the script at the first failure.

### `scripts/github-settings.sh`, steps 1 to 5

Step 4 chooses the reviewer's id:

```bash
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  reviewer_id="<id of $reviewer>"
else
  reviewer_id="$(gh api "users/$reviewer" --jq .id)"
fi
```

In a dry run there is no network call; otherwise `gh api users/<login> --jq .id` returns the account's number. The calls themselves are explained in `gh-cli.md`.

### `scripts/set-variables.sh`

```bash
env_dir="$(cd "$(dirname "$0")/.." && pwd)/infra/environments/demo"

set_variable() {
  local name="$1" output="$2" value
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "gh variable set $name --repo $repo --body <terraform output $output>"
  else
    value="$(terraform -chdir="$env_dir" output -raw "$output")"
    gh variable set "$name" --repo "$repo" --body "$value"
  fi
}

set_variable AWS_DEPLOY_ROLE_ARN deploy_role_arn
set_variable AWS_REGION region
set_variable DEPLOY_BUCKET deploy_bucket
```

`local name="$1" output="$2" value` declares three variables private to the function and assigns the first two from the function's arguments (`$1`, `$2`). Calling `set_variable AWS_REGION region` publishes the Terraform output `region` as the repository variable `AWS_REGION`.

## Try it yourself

1. `bash --version | head -1` shows your Bash version.
2. `DRY_RUN=1 scripts/github-settings.sh owner/repo octocat` prints five numbered steps and the `gh api` commands without running them.
3. `scripts/github-settings.sh 'bad name' x; echo $?` prints `github-settings: 'bad name' is not OWNER/REPO` and `2`.
4. `DRY_RUN=1 scripts/set-variables.sh owner/repo` prints three `gh variable set ...` lines.
5. `bash -c 'set -e; false; echo not reached'; echo $?` prints `1` only: `set -e` stopped it.

## Mistakes people make

- Unquoted variables (`$title` instead of `"$title"`).
- Building a command from untrusted text with `eval`, `bash -c "$text"`, or by pasting `${{ }}` into a script. This is attack 1.
- No `set -e`, so a failed step is ignored.
- Assuming macOS's old `/bin/bash` 3.2 has `declare -A`.
- Putting `|| true` after everything and hiding real failures.
- Putting a secret on a command line, where `ps` and logs can show it.

## Check yourself

1. What do `-e`, `-u` and `pipefail` do? *(Stop on error; error on an unset variable; fail a pipeline when any part fails.)*
2. What does `${1:?usage}` do? *(Stops with the message if the argument is missing.)*
3. What does `<<JSON` do and when does `$var` expand inside? *(Feeds lines up to `JSON` to a command; an unquoted `JSON` marker lets variables expand.)*
4. Why `trap ... EXIT`? *(Cleanup runs however the script ends.)*
5. Why does the hardened `greet.yml` read `$TITLE` instead of `${{ ... }}`? *(Text pasted into a script is parsed as code; an environment variable's value is only data.)*

## Further reading

- GNU Bash manual (5.x): https://www.gnu.org/software/bash/manual/bash.html
- Workflow commands (`::error`): https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
