# GitHub Actions: triggers, tokens, environments and the attacks on them

## What it is

GitHub Actions is the service that runs your automation on GitHub's computers. You describe the automation in a text file called a **workflow**, stored in the folder `.github/workflows/` of your repository. GitHub reads that file, waits for an **event** you named (someone pushed code, someone opened an issue, someone opened a pull request), and then starts a fresh virtual machine, called a **runner**, to do the work.

A workflow has these parts:

- **Trigger** (`on:`): the event that starts it.
- **Job**: a group of steps that runs on one runner. Jobs run at the same time unless you order them.
- **Step**: one command (`run:`) or one packaged piece of code (`uses:`, called an **action**).
- **Token**: every run gets a password called `GITHUB_TOKEN`, made just for that run. Steps use it to talk to GitHub (for example to post a comment). What the token may do is set by `permissions:`.
- **Secret and variable**: values stored in the repository settings. Secrets are hidden in logs. Variables are plain text.
- **Environment**: a named place such as `production` that can demand a human approval before a job may start.

This repository is about the dangerous side of all of that. Each of those parts can be set up wrongly, and a stranger on the internet can sometimes use the mistake. The repository shows three mistakes on purpose, then fixes them.

## Why this repository uses it

The task is "attack and harden": show how a workflow gets exploited, then change it so the same attack fails. That needs real workflows with real triggers. The lab files in `exploit/vulnerable/` are the weak versions. The files in `.github/workflows/` are the hardened versions. The two sets use the same events, so you can compare them line by line.

## Where it appears

| Path | What it is |
| --- | --- |
| `.github/workflows/ci.yml` | Static checks on every push to `main` and every pull request: app, workflows, Terraform. Read-only token. |
| `.github/workflows/greet.yml` | Fix 1: prints the title of a new issue safely. |
| `.github/workflows/pr-build.yml` | Fix 2, first half: builds a pull request with no privileges and hands over a small result file. |
| `.github/workflows/pr-report.yml` | Fix 2, second half: a privileged workflow that reads the result file and posts a comment. |
| `.github/workflows/label.yml` | Fixes 3 and 4: adds labels using `pull_request_target`, never running the pull request's code. |
| `.github/workflows/deploy.yml` | Fix 5: deploys with a short-lived cloud login (OIDC) after a human approves. |
| `.github/labeler.yml` | The label rules that `label.yml` reads. |
| `exploit/vulnerable/.github/workflows/` | The three deliberately weak workflows (not active; only `act` runs them). |
| `exploit/events/*.json` | Fake event payloads that stand in for what GitHub sends. |
| `pipeline/harden-lint.ts` | A linter written for this repository that finds the same mistakes. |

## How it works underneath

### From event to runner

1. Something happens (a push, an opened issue). GitHub builds a JSON document describing it, the **event payload**.
2. GitHub looks in `.github/workflows/` for files whose `on:` matches. Which version of the files it reads depends on the event (see below).
3. For each matching workflow, GitHub starts a job on a fresh runner, a Linux virtual machine that is thrown away afterwards.
4. Steps run one after another. A `run:` step starts a shell (Bash here) and gives it the text of the script. A `uses:` step downloads an action (a folder of code at a given version) and runs it.

### Expressions are text substitution, done before the shell

Anything written as `${{ ... }}` is an **expression**. GitHub evaluates it and pastes the result into the file's text *before* the shell is even started. This is the root of attack 1. If the script is

```yaml
run: echo "New issue: ${{ github.event.issue.title }}"
```

and the issue title is `x"; echo PWNED; echo "`, then the shell receives

```bash
echo "New issue: x"; echo PWNED; echo ""
```

which is three commands, not one. The title was typed by a stranger and became code. The fix is to put the value in an environment variable (`env:`) and let the shell read it as `"$TITLE"`. The shell never re-reads the *contents* of a variable as code.

### Which code runs, and with what rights

This is the heart of attacks 2 and 3. Events from pull requests come in two flavors:

| Trigger | Which workflow file runs | Token | Secrets available | Checks out |
| --- | --- | --- | --- | --- |
| `pull_request` | The one in the pull request's own branch | Read-only if the PR is from a fork | No, if the PR is from a fork | The merged result of the PR |
| `pull_request_target` | The one on the **base** branch (the real repository's default branch) | Read and write unless limited | Yes | Whatever you ask for; by default the base branch |
| `workflow_run` | The one on the default branch, after another workflow finished | Read and write unless limited | Yes | The default branch |

`pull_request` is safe for strangers' code because GitHub takes away the privileges. `pull_request_target` and `workflow_run` run with the real repository's privileges. They are meant for harmless chores (labeling, commenting). The danger is checking out the stranger's code in such a workflow and running it: now their code has your token and your secrets. That is **attack 2**.

The cure used here is to split the job in two. `pr-build.yml` runs under `pull_request`, builds and tests the stranger's code with no privileges, and leaves one small file as an **artifact**. `pr-report.yml` runs under `workflow_run`, with privileges, never touches the stranger's code, treats the file as untrusted data, and checks every field before using it.

### The token and its scope

`GITHUB_TOKEN` is created for each run and expires when the run ends. Its power is set from the top down:

1. The repository default (read-only or read-write, set in the repository settings).
2. A `permissions:` block at the top of the workflow overrides that default.
3. A `permissions:` block on a job overrides the top one for that job.

If a workflow has no `permissions:` at all, the token uses the repository default, which in many repositories is read and write. That is **attack 3**: a labeling workflow that needs almost nothing carries a token that can change the repository. `permissions: {}` means "no scopes at all". Each workflow here starts with `permissions: {}` or `contents: read` and each job asks for exactly what it uses.

### Environments, approvals and OIDC

A job with `environment: production` waits until the environment's rules are met, for example a required reviewer clicking Approve. Only then does the job start, and only then can it ask for an **OIDC token** (OpenID Connect, a signed note from GitHub saying who is asking). The cloud provider checks the note against a trust policy. See `oidc.md` and `aws-iam.md`. `id-token: write` is the permission that lets a job ask for that note.

### Pinning an action to a commit

`uses: actions/checkout@v7` means "whatever the tag `v7` points to today". The owner can move a tag. `uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` names an exact commit, which can never change. The `# v7.0.1` comment is for humans and for Dependabot.

## Walkthrough of this repository's use

### The weak workflows (`exploit/vulnerable/`)

`greet.yml`, attack 1:

```yaml
on:
  issues:
    types: [opened]
jobs:
  greet:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "New issue: ${{ github.event.issue.title }}"
```

`on: issues: types: [opened]` fires when an issue is opened. `runs-on: ubuntu-latest` picks the runner image. `run: |` starts a multi-line text block (see `yaml.md`). The expression inside the echo is the hole. There is no `permissions:` block either.

`label.yml`, attack 3: a job with no `permissions:` anywhere, so the token takes the repository default.

`pr-build.yml`, attack 2:

```yaml
on:
  pull_request_target:
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: npm run build
```

Four mistakes in nine lines: a privileged trigger; a secret placed in the job's environment where every step can read it; `ref:` set to the pull request's own commit, so the stranger's files are checked out; and `npm run build`, which runs a command the stranger controls (`package.json` is one of the files they can change).

### The hardened workflows

`greet.yml`:

```yaml
permissions: {}

jobs:
  greet:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    permissions: {}
    steps:
      - env:
          TITLE: ${{ github.event.issue.title }}
        run: |
          echo "New issue: $TITLE"
```

`permissions: {}` at the top and on the job: no scopes. `timeout-minutes: 2` stops a stuck job. The step has no `uses:` and no `name:`; it only has `env:` and `run:`. `TITLE` is given the title by GitHub (a safe, plain assignment; the value is stored, never parsed as shell). The script reads `$TITLE`. In the script text the string `${{` does not appear, which is exactly what the linter in `pipeline/harden-lint.ts` checks.

`pr-build.yml`:

```yaml
on:
  pull_request:

permissions:
  contents: read

concurrency:
  group: pr-build-${{ github.ref }}
  cancel-in-progress: true
```

`pull_request` is the unprivileged trigger. `contents: read` is the only scope. `concurrency` puts runs into named groups so a new push to the same pull request cancels the older run (`cancel-in-progress: true`). The steps check out with `persist-credentials: false` (do not leave the token in `.git/config`), install with `npm ci --ignore-scripts`, then `npm run build` and `npm test`. Finally:

```yaml
      - name: Record the result for pr-report
        if: always()
        env:
          PR_NUMBER: ${{ github.event.pull_request.number }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
          JOB_STATUS: ${{ job.status }}
        run: |
          jq -n --argjson pr "$PR_NUMBER" --arg sha "$HEAD_SHA" --arg conclusion "$JOB_STATUS" \
            '{pr: $pr, sha: $sha, conclusion: $conclusion}' > result.json
      - if: always()
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: build-result
          path: result.json
          retention-days: 1
          if-no-files-found: error
```

`if: always()` runs the step even if the build failed, because a failure also needs reporting. The three values go through `env:` (not pasted into the script), and `jq` builds the JSON file so quoting is handled for us (see `jq.md`). The artifact is kept one day, and `if-no-files-found: error` fails the job if the file is missing.

`pr-report.yml`:

```yaml
on:
  workflow_run:
    workflows: [pr-build]
    types: [completed]

permissions: {}

jobs:
  report:
    if: github.event.workflow_run.event == 'pull_request'
    ...
    permissions:
      actions: read
      pull-requests: write
```

`workflow_run` fires when the workflow named `pr-build` finishes. The job's `if:` makes sure the earlier run was a pull request. The two scopes: `actions: read` to download the artifact of that other run, `pull-requests: write` to post the comment. The download step names the run explicitly:

```yaml
      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: build-result
          path: result
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ github.token }}
```

`run-id` says "from that run, not this one"; `github-token` is needed to read another run's files. Then `npx tsx pipeline/post-result-cli.ts result/result.json` runs code that comes from the **default branch** (this job checks out the repository itself, not the pull request) and validates the file before use (see `typescript.md`).

`label.yml`:

```yaml
on:
  pull_request_target:
    types: [opened, synchronize, reopened]

permissions: {}

jobs:
  label:
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/labeler@bf12e9b00b37c5c0ca2b87b79b2daf7891dbda13 # v7.0.0
        with:
          sync-labels: true
```

This keeps the privileged trigger on purpose, because adding a label to a fork's pull request needs write rights. It is safe because there is no checkout step: the labeler asks the GitHub API which files changed. See `labeler.md`.

`deploy.yml`:

```yaml
permissions: {}

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  deploy:
    environment: production
    permissions:
      id-token: write # lets the job request an OIDC token
      contents: read
```

`environment: production` is the gate where a reviewer must approve. `id-token: write` allows the OIDC request. `cancel-in-progress: false` means two deploys queue instead of the second killing the first half way. Then `aws-actions/configure-aws-credentials` takes `role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}` (a repository *variable*, plain text, because a role name is not a secret) and trades the OIDC token for temporary AWS credentials. The upload step passes the bucket through `env:` too and runs `aws s3 sync dist "s3://${BUCKET}/releases/${GITHUB_SHA}/" --no-progress`: copy the build folder to a path named after the commit.

`ci.yml` has `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`: a new push cancels older runs on branches but never a run on `main`. Its three jobs (`app`, `workflows`, `infra`) each have `timeout-minutes` and `contents: read`.

## Try it yourself

1. `grep -n "permissions" .github/workflows/*.yml` shows that every workflow and every job states its scopes.
2. `grep -n "persist-credentials" .github/workflows/*.yml` shows it set to `false` after every checkout.
3. `npx tsx pipeline/harden-lint-cli.ts` checks every workflow here. Expected last line: `harden-lint: 0 error(s), 0 warning(s)`.
4. `npx tsx pipeline/harden-lint-cli.ts exploit/vulnerable/.github/workflows` checks the weak ones. Expected: eight error lines and `harden-lint: 8 error(s), 0 warning(s)`, exit code 1.
5. `actionlint` (no arguments) prints nothing for the hardened files. `actionlint exploit/vulnerable/.github/workflows/*.yml` prints `"github.event.issue.title" is potentially untrusted`.

## Mistakes people make

- Putting `${{ github.event.* }}` straight into a `run:` script. Titles, branch names, commit messages and comment bodies are all text a stranger chose.
- Using `pull_request_target` and checking out `github.event.pull_request.head.sha`, then running anything from it.
- Leaving out `permissions:` and trusting the default token to be harmless.
- Trusting the *contents* of an artifact from a run that executed untrusted code. Validate every field.
- Pinning to a tag (`@v4`) and assuming it is stable.
- Storing a long-lived cloud key as a secret instead of using OIDC.
- Writing `if: always()` only on the report step, so a failed build leaves no result at all.

## Check yourself

1. Why is `echo "${{ github.event.issue.title }}"` unsafe, but `echo "$TITLE"` with `TITLE` set under `env:` safe? *(The expression is pasted into the script text before the shell starts; a variable's value is only data to the shell.)*
2. What is the difference between `pull_request` and `pull_request_target`? *(The first runs the pull request's workflow with reduced rights; the second runs the base branch's workflow with full rights.)*
3. Why are there two workflows, `pr-build` and `pr-report`? *(One runs the stranger's code without privileges; the other has privileges and never runs the stranger's code.)*
4. What does `permissions: {}` mean? *(The token gets no scopes at all.)*
5. Why does `deploy.yml` need `id-token: write`? *(Without it the job cannot ask GitHub for the OIDC token that AWS checks.)*

## Further reading

- Workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- Security hardening for GitHub Actions (script injection, `pull_request_target`, pinning): https://docs.github.com/en/actions/reference/security/secure-use
- Events that trigger workflows: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Controlling permissions for `GITHUB_TOKEN`: https://docs.github.com/en/actions/tutorials/authenticate-with-github_token
