# GitHub Actions: triggers, tokens, environments and the attacks on them

## What it is

**GitHub** is a website that stores the files of software projects in **repositories** and lets many people work on them. A **repository** (repo) is a folder of files plus its complete history of changes. **GitHub Actions** is a service of GitHub that runs automation for a repository on GitHub's own computers.

You describe the automation in a text file called a **workflow**. Workflows live in the folder `.github/workflows/` of the repository and are written in YAML (see `yaml.md`). GitHub watches the repository. When something you named happens, an **event**, GitHub starts a fresh virtual computer for you, called a **runner**, runs the commands you wrote, shows the output in a log, and throws the computer away.

The vocabulary, from the outside in:

- **Event**: something that happens in the repository. Examples used here: someone pushes new commits (`push`); someone opens an issue (`issues`); someone opens or updates a **pull request** (a proposal to merge one set of changes into another, `pull_request`); another workflow finishes (`workflow_run`); a person clicks a button (`workflow_dispatch`).
- **Event payload**: a JSON document (see `json.md`) that GitHub builds to describe exactly what happened: who, which issue, which title. Inside a workflow you read it as `github.event`.
- **Trigger**: the `on:` section of a workflow, which says which events start it.
- **Job**: a group of steps that runs on one runner. Jobs of one workflow run at the same time, unless one says it `needs` another.
- **Runner**: the computer a job runs on. `runs-on: ubuntu-latest` asks for a Linux machine (Ubuntu) maintained by GitHub. It starts clean every time.
- **Step**: one task inside a job. A step is either a command (`run:`) typed into a shell, or a ready-made piece of code (`uses:`).
- **Shell**: the program that reads commands typed as text. On the runner, `run:` steps use Bash (see `bash.md`).
- **Action**: a packaged, reusable piece of code that a step can use, such as `actions/checkout`, which copies the repository's files onto the runner. Actions are themselves repositories; `owner/name@version` says which one.
- **Token** (`GITHUB_TOKEN`): a password GitHub creates for each run and deletes when it ends. Steps use it to talk to GitHub (for example, to post a comment). Which things it may do is set by `permissions:`.
- **Secret** and **variable**: values stored in the repository's settings, not in its files. A secret is hidden in logs; a variable is plain text.
- **Environment**: a named place, such as `production`, that can demand rules (for example, a named person must approve) before a job that uses it may start.
- **Artifact**: a file (or a few) that one job uploads so that later jobs or people can download it.

This repository is about the dangerous side of all of that. Each part can be set up in a way that lets a stranger on the internet use the repository's own power. The lab shows three mistakes on purpose, then fixes them.

## Why this repository uses it

The task is "attack and harden": show how a workflow is exploited, then change it so the same attack fails. That needs real workflows with real triggers. The lab files in `exploit/vulnerable/` are the weak versions; the files in `.github/workflows/` are the hardened versions. Both sets listen to the same events, so you can compare them line by line.

## Where it appears

| Path | What it is |
| --- | --- |
| `.github/workflows/ci.yml` | Static checks on every push to `main` and every pull request: the app, the workflows, the Terraform. Read-only token. |
| `.github/workflows/greet.yml` | Fix 1: prints the title of a new issue safely. |
| `.github/workflows/pr-build.yml` | Fix 2, first half: builds a pull request with no privileges, and leaves a small result file. |
| `.github/workflows/pr-report.yml` | Fix 2, second half: a privileged workflow that reads the result file and posts a comment. |
| `.github/workflows/label.yml` | Fixes 3 and 4: adds labels with `pull_request_target`, never running the pull request's code. |
| `.github/workflows/deploy.yml` | Fix 5: deploys with a short-lived cloud login (OIDC) after a person approves. |
| `.github/labeler.yml`, `.github/dependabot.yml` | Configuration files read by the labeler and by Dependabot (see `labeler.md`, `dependabot.md`). |
| `exploit/vulnerable/.github/workflows/*.yml` | The three weak workflows (not active; only `act` runs them). |
| `exploit/events/*.json` | Fake event payloads standing in for what GitHub would send. |
| `exploit/stubs/*/action.yml` | Stand-in actions used by `act` (see `act.md`). |
| `pipeline/harden-lint.ts` | A linter written for this repository that finds the same mistakes. |

## How it works underneath

### From event to runner

1. Something happens (a push, an opened issue). GitHub builds the event payload.
2. GitHub looks in `.github/workflows/` for workflow files whose `on:` matches the event. Which *version* of the workflow files it reads depends on the event (the table below).
3. For each matching workflow, GitHub starts each job on a new runner, a Linux virtual machine that is thrown away afterwards. The runner begins with no copy of your repository; a step must fetch it.
4. Steps run one after another. A `run:` step starts Bash and gives it the step's text as a script. A `uses:` step downloads the named action (a folder of code at a specific version) and runs it.
5. If a step fails (its program ends with a non-zero **exit code**, a number where 0 means success), the job stops, unless the step says otherwise, and the job is marked failed. The result is shown on the pull request or commit.

### Expressions are text substitution, done before the shell

Anything written as `${{ ... }}` is an **expression**. GitHub evaluates it itself and pastes the result into the file's text **before** the shell is started. This is the root of attack 1. If a script is

```yaml
run: echo "New issue: ${{ github.event.issue.title }}"
```

and the issue title is `x"; echo PWNED; echo "`, then the shell receives

```bash
echo "New issue: x"; echo PWNED; echo ""
```

That is three commands, not one. The title was typed by a stranger and became code. The cure is to hand the value over as an **environment variable** instead. An environment variable is a named text value that a program receives from whoever starts it. The shell reads `"$TITLE"` and treats whatever is inside as plain text, never as new commands. (`env:` sets environment variables for a step.)

### Pull request triggers: which code runs, and with what rights

This is the heart of attacks 2 and 3. A **fork** is a copy of a repository that someone else owns; a stranger proposes changes by making a fork and opening a pull request from it.

| Trigger | Which workflow file runs | Token | Secrets available | What `actions/checkout` fetches by default |
| --- | --- | --- | --- | --- |
| `pull_request` | The one in the pull request's own branch | Read-only if the PR is from a fork | No, if the PR is from a fork | The merged result of the PR |
| `pull_request_target` | The one on the **base** branch (the real repository's default branch) | Read and write unless limited | Yes | The base branch |
| `workflow_run` | The one on the default branch, after another workflow finished | Read and write unless limited | Yes | The default branch |

`pull_request` is safe for strangers' code because GitHub takes away the privileges. `pull_request_target` and `workflow_run` run with the real repository's privileges; they are meant for harmless chores (labeling, commenting). The danger is **checking out the stranger's code in such a workflow and running it**: now their code runs with your token and your secrets. That is **attack 2**.

The cure used here is to split the job in two. `pr-build.yml` runs under `pull_request`, builds and tests the stranger's code with no privileges, and leaves one small file as an artifact. `pr-report.yml` runs under `workflow_run`, has privileges, never touches the stranger's code, treats the file as untrusted data, and checks every field before using it.

### The token and its scope

`GITHUB_TOKEN` is created for each run and expires when the run ends. Its power is set from the top down:

1. The repository default (read-only, or read and write; set in the repository's settings).
2. A `permissions:` block at the top of the workflow overrides that default.
3. A `permissions:` block on a job overrides the top one for that job.

If a workflow has no `permissions:` at all, the token uses the repository default, which in many repositories is read and write. That is **attack 3**: a labeling workflow that needs almost nothing carries a token that can change the repository. `permissions: {}` means "no scopes at all". A **scope** is one kind of permission: `contents` (the files), `pull-requests`, `issues`, `actions`, `id-token`, and so on, each `read`, `write` or `none`.

### Environments, approvals and OIDC

A job with `environment: production` waits until the environment's rules are met, for example a required reviewer clicking Approve. Only then does the job start, and only then can it ask for an **OIDC token**, a signed note from GitHub that says who is asking. The cloud provider checks the note against a trust policy. See `oidc.md` and `aws-iam.md`. `id-token: write` is the permission that lets a job ask for that note.

### Pinning an action to a commit

`uses: actions/checkout@v7` means "whatever the tag `v7` points to today". The owner can move a tag. `uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` names an exact commit, which can never change (see `git.md`). The `# v7.0.1` after it is a comment for humans and for Dependabot.

### Concurrency

`concurrency:` puts runs into named groups. Only one run per group is active at a time; `cancel-in-progress: true` cancels the older run when a newer one starts in the same group.

## Walkthrough of this repository's use

### The weak workflows, `exploit/vulnerable/.github/workflows/`

`greet.yml` (attack 1):

```yaml
name: greet
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

- `name: greet` is the label shown in GitHub's list of workflows.
- `on:` with `issues:` and `types: [opened]` means: start when an issue is opened (not when it is edited or closed).
- `jobs:` holds the jobs; here one job named `greet`.
- `runs-on: ubuntu-latest` picks the runner.
- `steps:` is a list; each item starts with `-`. This step has only `run:`.
- `run: |` begins a multi-line block of text (see `yaml.md`); the line under it is the script.
- `${{ github.event.issue.title }}` is the hole: the title is pasted into the script.
- There is no `permissions:` block either.

The comment at the top of the file records why it uses a block: a one-line `run: echo "New issue: ..."` is not even valid YAML.

`label.yml` (attack 3):

```yaml
name: label
on:
  pull_request:
jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - run: echo "labeling"
```

It does nothing risky itself; the weakness is what is **missing**: there is no `permissions:`, so the job's token takes the repository default (often read and write). `on: pull_request:` with nothing under it means "any pull request event of the default kinds".

`pr-build.yml` (attack 2):

```yaml
name: pr-build
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

Four mistakes in a few lines. (1) `pull_request_target` gives the workflow the real repository's rights. (2) `env:` at the job level puts the secret `DEPLOY_TOKEN` in the environment of **every** step. (3) `actions/checkout@v4` is pinned to a movable tag, and `with: ref:` set to the pull request's head commit fetches the stranger's files onto the runner. (4) `npm run build` then runs a command defined in the stranger's `package.json`.

### The hardened workflows, `.github/workflows/`

**`greet.yml`** (fix 1):

```yaml
name: greet
on:
  issues:
    types: [opened]
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

- The top-level `permissions: {}` gives every job no scopes; the job repeats it so the intent is explicit.
- `timeout-minutes: 2` stops a stuck job after two minutes (the default is six hours).
- The step has `env:` and `run:` and no name. `TITLE: ${{ github.event.issue.title }}` is evaluated by GitHub and stored as the value of a variable. It is **not** pasted into a script. The `run:` text contains only `$TITLE`, which the shell replaces with the stored value as plain text.
- Quotes around `"New issue: $TITLE"` keep the shell from splitting the value into words.

**`pr-build.yml`** (fix 2, build half). Top of the file:

```yaml
name: pr-build
on:
  pull_request:
permissions:
  contents: read
concurrency:
  group: pr-build-${{ github.ref }}
  cancel-in-progress: true
```

`pull_request` is the unprivileged trigger. The token has one scope, `contents: read`. `concurrency.group` is a text label built from `github.ref` (the branch or pull request reference), so each pull request has its own group; a new push cancels the older run of the same pull request.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: "22"
          cache: npm
      - run: npm ci --ignore-scripts
      - run: npm run build
      - run: npm test
```

- `actions/checkout` copies the repository's files onto the runner. `persist-credentials: false` stops it from saving the job's token in the file `.git/config` (where a later step could read it; see `git.md`).
- `actions/setup-node` installs Node.js (see `node.md`). `node-version: "22"` is quoted so it stays text. `cache: npm` saves npm's download folder between runs, keyed by the hash of `package-lock.json`, to save time.
- `npm ci --ignore-scripts` installs exactly the locked packages and skips packages' install scripts (see `npm.md`).
- `npm run build` and `npm test` build and test the (possibly stranger's) code. This is safe because there is no secret and the token is read-only.

The last two steps record the result:

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

- `name:` gives the step a readable label in the log.
- `if: always()` makes the step run **even if an earlier step failed**. Normally a failed step stops the job; a failed build still needs reporting.
- The three `env:` values: the pull request number, the commit's full hash, and the job's own status so far (`success`, `failure` or `cancelled`). They are handed over as environment variables, not pasted into the script.
- The script uses `jq` to write a JSON file (see `jq.md`). The trailing `\` continues the command on the next line.
- `actions/upload-artifact` stores `result.json` under the name `build-result`. `retention-days: 1` deletes it after a day. `if-no-files-found: error` fails the job if the file does not exist.

**`pr-report.yml`** (fix 2, report half):

```yaml
name: pr-report
on:
  workflow_run:
    workflows: [pr-build]
    types: [completed]
permissions: {}
jobs:
  report:
    if: github.event.workflow_run.event == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      actions: read # download the artifact of the run that triggered this one
      pull-requests: write # post the comment
```

- `workflow_run` fires when the workflow named in `workflows:` ends. `types: [completed]` means it fires for any ending (success or failure).
- `if:` on a job is a condition. `github.event.workflow_run.event == 'pull_request'` is true only if the earlier run was caused by a pull request.
- Two scopes: `actions: read` to download another run's artifact, `pull-requests: write` to post the comment.

```yaml
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: "22"
          cache: npm
      - run: npm ci --ignore-scripts
      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: build-result
          path: result
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ github.token }}
      - run: npx tsx pipeline/post-result-cli.ts result/result.json
        env:
          GITHUB_TOKEN: ${{ github.token }}
          GITHUB_REPOSITORY: ${{ github.repository }}
```

- Because this runs from `workflow_run`, `actions/checkout` fetches the **default branch**: the repository's own reviewed code, never the pull request's.
- `download-artifact` fetches the file named `build-result` into the folder `result`. `run-id` says "from that other run", not this one; `github-token` is required to read another run's files.
- The last step runs the poster (`tsx`, see `tsx.md`) with the token and the repository name as environment variables. The script validates the file before using any field (see `typescript.md`).

**`label.yml`** (fixes 3 and 4):

```yaml
name: label
on:
  pull_request_target:
    types: [opened, synchronize, reopened]
permissions: {}
jobs:
  label:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read # the labeler reads .github/labeler.yml from the base branch through the API
      pull-requests: write # and adds the labels
    steps:
      - uses: actions/labeler@bf12e9b00b37c5c0ca2b87b79b2daf7891dbda13 # v7.0.0
        with:
          sync-labels: true
```

`pull_request_target` is deliberate here: adding a label to a fork's pull request needs write rights. It is safe because there is **no checkout step**; the labeler asks GitHub's API for the changed file names. `types:` limits it to a new pull request (`opened`), new commits pushed to it (`synchronize`) and a reopened one (`reopened`). `sync-labels: true` removes labels that no longer apply. See `labeler.md`.

**`deploy.yml`** (fix 5):

```yaml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions: {}
concurrency:
  group: deploy
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: production
    permissions:
      id-token: write # lets the job request an OIDC token
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: "22"
          cache: npm
      - run: npm ci --ignore-scripts
      - run: npm run build
      - uses: aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
      - name: Upload the build
        env:
          BUCKET: ${{ vars.DEPLOY_BUCKET }}
        run: aws s3 sync dist "s3://${BUCKET}/releases/${GITHUB_SHA}/" --no-progress
```

- Triggers: a push to `main`, or `workflow_dispatch` (the "Run workflow" button).
- `concurrency.group: deploy` with `cancel-in-progress: false`: if two deploys overlap, the second **waits** instead of killing the first half-way.
- `environment: production` is the approval gate. The job does not start until the environment's rules are satisfied.
- `id-token: write` lets the job request an OIDC token; `contents: read` is enough for `checkout`.
- `configure-aws-credentials` asks GitHub for the token and trades it with AWS for temporary credentials for the role named by `role-to-assume`. `vars.X` reads a repository **variable** (plain text, set by `scripts/set-variables.sh`). A role's name is an address, not a secret.
- The final step copies the compiled `dist` folder to `s3://<bucket>/releases/<commit hash>/`. `GITHUB_SHA` is an environment variable GitHub sets: the full hash of the commit being built. `BUCKET` comes through `env:`. `--no-progress` keeps the log short. The temporary credentials from the previous step are in the environment, so the `aws` program finds them by itself.

**`ci.yml`**: the checks on the repository itself.

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

It runs for pushes to `main` and for every pull request. `cancel-in-progress` here is an expression: true on every branch but `main`, so a push to a pull request cancels the older check, while runs on `main` are always finished.

Job `app` (timeout 10 minutes, `contents: read`): checkout (no saved credentials), `setup-node` with caching, `npm ci --ignore-scripts`, `npm run typecheck` (the compiler checks types), `npm run lint` (ESLint and Prettier), `npm test` (the tests with coverage), `npm run build`, and `npm audit --audit-level=high` (fails if a locked package has a known high-severity flaw).

Job `workflows` (timeout 10 minutes): the same checkout, Node and `npm ci`, then:

```yaml
      - run: scripts/install-actionlint.sh
      - run: echo "$PWD/.tools/bin" >> "$GITHUB_PATH"
      - run: actionlint
      - run: npx tsx pipeline/harden-lint-cli.ts
```

Install a pinned `actionlint` (see `actionlint.md`), add its folder to the `PATH` of the following steps by appending to the file named by `$GITHUB_PATH`, run `actionlint`, then run the repository's own linter (see `typescript.md`).

Job `infra` (timeout 15 minutes): checkout, Node, then

```yaml
      - uses: hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e # v4.0.1
        with:
          terraform_wrapper: false
      - run: npm ci --ignore-scripts
      - run: make infra-check
```

`setup-terraform` installs Terraform; `terraform_wrapper: false` turns off a helper that wraps the program's output, so `terraform show -json` prints clean JSON. `make infra-check` runs the format check, the offline tests, validation, an offline plan and the trust-policy check (see `terraform.md`, `make.md`).

<!-- walk:.github/workflows/ci.yml -->
### `.github/workflows/ci.yml`, line by line

Lines 30 to 36:

```yaml
          cache: npm
      - run: npm ci --ignore-scripts
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npm audit --audit-level=high
```

The `app` job's steps in order: `npm ci --ignore-scripts` (install exactly the locked packages), `npm run typecheck` (compile without output), `npm run lint` (ESLint and Prettier), `npm test` (Vitest with coverage), `npm run build` (compile `src` into `dist`), `npm audit --audit-level=high`.

<!-- /walk:.github/workflows/ci.yml -->

## Try it yourself

1. `grep -n "permissions" .github/workflows/*.yml` shows that every workflow and every job states its scopes.
2. `grep -n "persist-credentials" .github/workflows/*.yml` shows `false` after every checkout.
3. `npx tsx pipeline/harden-lint-cli.ts` checks every workflow here. The last line is `harden-lint: 0 error(s), 0 warning(s)`.
4. `npx tsx pipeline/harden-lint-cli.ts exploit/vulnerable/.github/workflows` checks the weak ones. Expected: eight error lines, `harden-lint: 8 error(s), 0 warning(s)`, and exit code 1.
5. `actionlint` prints nothing for the hardened files; `actionlint exploit/vulnerable/.github/workflows/*.yml` prints `"github.event.issue.title" is potentially untrusted`.

## Mistakes people make

- Putting `${{ github.event.* }}` straight into a `run:` script. Titles, branch names, commit messages and comment bodies are all text a stranger chose.
- Using `pull_request_target` and checking out `github.event.pull_request.head.sha`, then running anything from it.
- Leaving out `permissions:` and trusting the default token to be harmless.
- Trusting the contents of an artifact from a run that executed untrusted code. Validate every field.
- Pinning to a tag (`@v4`) and assuming it is stable.
- Storing a long-lived cloud key as a secret instead of using OIDC.
- Putting `if: always()` only on the report step, so a failed build leaves no result at all.

## Check yourself

1. Why is `echo "${{ github.event.issue.title }}"` unsafe but `echo "$TITLE"` with `TITLE` under `env:` safe? *(The expression is pasted into the script text before the shell starts; a variable's value is only data to the shell.)*
2. What is the difference between `pull_request` and `pull_request_target`? *(The first runs the pull request's workflow with reduced rights; the second runs the base branch's workflow with full rights.)*
3. Why are there two workflows, `pr-build` and `pr-report`? *(One runs the stranger's code without privileges; the other has privileges and never runs the stranger's code.)*
4. What does `permissions: {}` mean? *(The token gets no scopes at all.)*
5. Why does `deploy.yml` need `id-token: write`? *(Without it the job cannot ask GitHub for the OIDC token that AWS checks.)*

## Further reading

- Workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- Security hardening for GitHub Actions (script injection, `pull_request_target`, pinning): https://docs.github.com/en/actions/reference/security/secure-use
- Events that trigger workflows: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Controlling permissions for `GITHUB_TOKEN`: https://docs.github.com/en/actions/tutorials/authenticate-with-github_token
