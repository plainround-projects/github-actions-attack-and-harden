# act

## What it is

act is a command-line tool that runs GitHub Actions workflows on your own machine. It reads the workflow YAML, starts a Docker container for each job (see `docker.md`) and runs the steps inside. It is an imitation of GitHub's runner, not an exact copy. This repository uses act 0.2.89.

## Why this repository uses it

The lab must show the attacks working and the fixes holding without publishing a vulnerable repository to the internet. `act` runs the real workflow files on your computer with a fake event, so `scripts/lab.sh` can prove, line by line, that the injected command ran under the vulnerable workflow and did not under the hardened one. Two attacks (the repository default token, and OIDC with a cloud account) need GitHub itself and are not reproduced with `act`.

## Where it appears

| Path | What it does with act |
| --- | --- |
| `.actrc` | Default flags: the runner image, no pulling, CPU architecture, daemon socket. |
| `scripts/lab.sh` | Runs four `act` commands and checks their logs. |
| `exploit/events/*.json` | The fake events. |
| `exploit/stubs/fork-checkout/`, `exploit/stubs/upload-artifact/` | Stand-in actions that `--local-repository` swaps in. |
| `Makefile` | `make run` calls `scripts/lab.sh`. |

## How it works underneath

act builds the job graph from the YAML, picks an image for each `runs-on` label, starts a container, copies the working folder in, downloads each `uses:` action from github.com (cached under `~/.cache/act`) and runs the steps. A step that uses a *remote reusable workflow* or action normally makes act clone it. `--local-repository 'owner/repo@ref=/path'` says "when something asks for this repository at this ref, use the folder instead". It cannot run Windows or macOS jobs.

## Walkthrough of this repository's use

### `.actrc`

```text
-P ubuntu-latest=gha-projects-act-runner:ubuntu-24.04
--pull=false
--container-architecture linux/arm64
--container-daemon-socket -
```

One flag per line, read from the directory you run `act` in. `-P` maps a runner label to an image (see `docker.md`). `--pull=false` uses the local image. `--container-architecture linux/arm64` runs the container as ARM (Apple Silicon). `--container-daemon-socket -` stops `act` from mounting the Docker socket into the job, which fails on Docker Desktop for Mac. Because `.actrc` is found relative to where `act` starts, the lab runs `act` from the repository root and uses `-C` to point at other folders.

### Attack 1 and fix 1

```bash
act --concurrent-jobs 1 issues -C exploit/vulnerable -W .github/workflows/greet.yml -e "$root/exploit/events/issue-injection.json"
act --concurrent-jobs 1 issues -W .github/workflows/greet.yml -e "$root/exploit/events/issue-injection.json"
```

`issues` is the event name. `-W` chooses the workflow file. `-e` gives the JSON payload that becomes `github.event`. `-C` changes the working directory (here the lab folder). `--concurrent-jobs 1` runs one job at a time to spare the machine. The first command runs the vulnerable `greet.yml`; the log contains a line `| INJECTED-COMMAND-RAN`. The second runs the hardened one; the same title appears as part of one `New issue:` line.

### Attack 2 and fix 2

```bash
act ... pull_request_target -b -C "$logs/fork-vulnerable" -W .github/workflows/pr-build.yml \
  -e "$root/exploit/events/pull-request-from-fork.json" --local-repository "actions/checkout@v4=$checkout_stub" -s "$fake_secret"
```

`pull_request_target` is the event. `-b` **binds** the folder as the workspace instead of copying it. `-s DEPLOY_TOKEN=demo-not-a-real-secret` supplies a fake secret (the value says what it is). `--local-repository "actions/checkout@v4=DIR"` tells `act` "when a step uses `actions/checkout@v4`, use the action in this folder instead". The vulnerable checkout sets `ref:` to the pull request's commit, which `act` cannot fetch (there is no fork), so the stand-in only prints that the fork was checked out; the lab prepared the fork's files in the folder beforehand with `exploit/fork/apply-fork-change.mjs`. The log must contain `FORK CODE RAN: event=pull_request_target deploy-token-in-environment=true`.

The fix run uses `pull_request`, no `-s`, and swaps the pinned `upload-artifact` for a stand-in (`--local-repository "$pinned_upload=$upload_stub"`) because the artifact service `act` imitates cannot be reached from a container when Docker runs inside a virtual machine. The log must contain `deploy-token-in-environment=false` and `artifact build-result: result.json`.

### What the script does with the result

`run()` keeps the whole log in a file, shows it only if `act` fails, and tolerates a Docker clean-up error that arrives after `Job succeeded`. `expect` and `expect_none` then check for the exact lines. The script prints `lab: every attack worked on the vulnerable workflow and every fix held` only if all of them hold.

### What `act` cannot show

`act` does not enforce `permissions`, does not run environments with approvals, cannot obtain an OIDC token, and does not know the repository's default token setting. Attacks 3 and 5 therefore need real GitHub, and the README records them as such.

### The two stand-in actions

An **action** defined inside a repository is a folder with a file named `action.yml`. A **composite action** (`runs.using: composite`) is an action made only of steps. `act`'s `--local-repository` swaps these in for real actions.

`exploit/stubs/fork-checkout/action.yml`:

```yaml
name: Check out the fork (lab stand-in)
description: The workspace already holds the fork's files; report it as a checkout would.
inputs:
  ref:
    description: Ignored; the lab always "checks out" the fork.
    required: false
    default: ""
runs:
  using: composite
  steps:
    - shell: bash
      run: |
        echo "checked out the fork's head commit (lab stand-in; the workspace is the fork's copy)"
```

`name` and `description` are labels. `inputs:` lists the settings a caller may give with `with:`; this action accepts `ref` (the vulnerable workflow passes one) and ignores it. `required: false` and `default: ""` make it optional. `runs.using: composite` says the action is a list of steps. A step in a composite action must say which `shell` runs its `run:` text (here `bash`). It only prints a sentence, because the lab already put the fork's files in the workspace.

`exploit/stubs/upload-artifact/action.yml` stands in for `actions/upload-artifact`:

```yaml
inputs:
  name:               { description: Artifact name.,   required: true }
  path:               { description: Files to upload, one per line., required: true }
  retention-days:     { description: Retention in days., required: false, default: "" }
  if-no-files-found:  { description: warn, error or ignore., required: false, default: warn }
runs:
  using: composite
  steps:
    - shell: bash
      env:
        ARTIFACT_NAME: ${{ inputs.name }}
        ARTIFACT_PATHS: ${{ inputs.path }}
        ARTIFACT_RETENTION: ${{ inputs.retention-days }}
        ARTIFACT_IF_MISSING: ${{ inputs.if-no-files-found }}
      run: |
        missing=0
        while IFS= read -r file; do
          [ -n "$file" ] || continue
          if [ -e "$file" ]; then
            echo "artifact ${ARTIFACT_NAME}: ${file} ($(wc -c < "$file" | tr -d ' ') bytes), expires in ${ARTIFACT_RETENTION:-90} days"
          else
            echo "artifact ${ARTIFACT_NAME}: ${file} is missing"
            missing=1
          fi
        done <<< "$ARTIFACT_PATHS"
        if [ "$missing" = 1 ] && [ "$ARTIFACT_IF_MISSING" = error ]; then
          exit 1
        fi
```

(The real file writes each input on several lines; the content is the same.) The four inputs mirror the real action's. The step passes inputs to the script as environment variables (the same safe pattern as the hardened workflows; `${{ inputs.name }}` is the value given by `with:`). The script: `missing=0` is a flag. `while IFS= read -r file; do ... done <<< "$ARTIFACT_PATHS"` reads the path list one line at a time (`IFS=` keeps leading spaces, `-r` keeps backslashes; `<<<` feeds a text to the loop as input). `[ -n "$file" ] || continue` skips empty lines (`-n` means "not empty"; `||` runs the right side if the left failed). `[ -e "$file" ]` is true if the file exists. `wc -c < "$file"` counts bytes; `tr -d ' '` removes spaces from the number. `${ARTIFACT_RETENTION:-90}` means "the variable, or 90 if empty". At the end, if a file was missing **and** `if-no-files-found` is `error`, exit with code 1 so the job fails, like the real action. This is why `pr-build.yml`'s `if-no-files-found: error` is still enforced under `act`.

## Try it yourself

1. `act --version` prints the version (checked with 0.2.89 for this repository).
2. `act -l` lists the jobs it finds in `.github/workflows`.
3. `act -l -W .github/workflows/greet.yml` lists only that workflow's job and its event (`issues`). (`act -n`, the dry run, still asks the Docker daemon to prepare the container, so it needs Docker running.)
4. `make run` (needs Docker, the built image and time) runs the whole lab and prints `ok` lines. It passed earlier (README, verification status); it was not re-run while these notes were written because the Docker engine was unavailable.
5. `cat .actrc` shows the four defaults.

## Mistakes people make

- Running `act` from a subfolder and losing `.actrc`.
- Expecting it to match GitHub exactly for permissions, secrets, environments and caches.
- Using a real secret with `-s`. Use a fake one.
- Running a workflow from an untrusted repository with `act`: it runs that code on your machine.
- Forgetting that step output is prefixed with `| ` in the log when matching lines.

## Check yourself

1. What does `-e` do? *(Supplies the JSON event payload.)*
2. What does `--local-repository A@REF=DIR` do? *(Uses the folder when a step asks for action A at that ref.)*
3. Why is a stand-in used for the vulnerable checkout? *(`act` cannot fetch the fork's commit; the lab prepared the fork's files already.)*
4. Why is the secret called `demo-not-a-real-secret`? *(So nobody mistakes it for a credential.)*
5. Which lab attacks can `act` not show? *(The default token's permissions and OIDC, which need GitHub and a cloud account.)*

## Further reading

- act user guide: https://nektosact.com/
- act 0.2.89: https://github.com/nektos/act/tree/v0.2.89#readme
