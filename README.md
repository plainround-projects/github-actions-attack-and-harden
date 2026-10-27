# github-actions-attack-and-harden

A repository that was deliberately vulnerable, hardened: shell injection through an issue title, a fork's code running under `pull_request_target` with a secret in scope, and a write-capable default token, each reproduced, then fixed; and a cloud deploy that uses OIDC and a protected environment instead of a stored key, with the AWS side as validated Terraform.

| | |
| --- | --- |
| **Lesson** | `/prep/github-actions/project-attack-and-harden`, "Exploit three GitHub Actions weaknesses, fix them, and deploy with OIDC" (`data-structure-explainer/src/content/tracks/github-actions/15-project-attack-and-harden.md` in the Plainround app) |
| **Planned hours** | 12 |
| **Level** | Advanced |
| **Architecture** | [ARCHITECTURE.md](ARCHITECTURE.md), decisions in [docs/adr](docs/adr), the real-GitHub steps in [docs/runbook.md](docs/runbook.md) |
| **Technology notes** | [tech/README.md](tech/README.md): one beginner-level note for every technology used here |

This repository is the **hardened** version. The lesson's three vulnerable workflows are in [`exploit/vulnerable/.github/workflows/`](exploit/vulnerable/.github/workflows), outside `.github/`, so they are lab files that never run on GitHub by themselves. Use them only in repositories you own, with a second account you own and a throwaway cloud account with a budget.

## Prerequisites

| Tool | Version | Used for |
| --- | --- | --- |
| Node.js and npm | 22.12 or newer (tested with 24.14 and npm 11) | the TypeScript app, the workflow tools, the tests |
| GNU Make | 3.81 or newer (the one on macOS works) | every command below |
| [act](https://github.com/nektos/act) and Docker | act 0.2.89, Docker 24 or newer | `make run`: the attacks and fixes on your machine, in the runner image built from [ci/act-runner/Dockerfile](ci/act-runner/Dockerfile) |
| Terraform | 1.9 or newer (tested with 1.17), AWS provider `~> 6.0` (6.70.0 locked) | `make infra-check` (no AWS account needed) |
| [actionlint](https://github.com/rhysd/actionlint) and shellcheck | 1.7.12 and 0.11 (`brew install actionlint shellcheck`) | linting workflows and scripts |
| `gh` CLI | any recent, signed in | only the scripts in `scripts/` that change GitHub settings (they have a `DRY_RUN=1` mode) |
| A second GitHub account, an AWS account | only for [docs/runbook.md](docs/runbook.md) | the attacks as an outside contributor; the real OIDC deploy |

No secrets are stored in this repository. The lesson's fake secret `demo-not-a-real-secret` appears in `scripts/lab.sh`, the runbook and this README, as the stand-in the vulnerable job has in scope; it is not a credential.

## Setup, run, test, stop

```bash
make up                 # npm ci from the lock file, build the act runner image, create the Terraform plugin cache
make run                # attacks 1 and 2 and their fixes with act, each checked (about ten minutes the first time)
make attack-scan        # stretch 1: actionlint and harden-lint pointed at the vulnerable files (they report problems)
make test               # unit, stream, process and pipeline tests with coverage (thresholds 95% lines, 90% branches)
make lint               # eslint with import-boundary rules, prettier, tsc, actionlint, harden-lint on the real workflows
make infra-check        # terraform fmt, validate, offline tests of the trust policy, offline plan, check-trust
make audit              # npm audit, high and above fails
make check              # lint, test and infra-check: everything that needs no Docker and no cloud account
make down               # remove leftover act containers
```

`make help` lists every target. `make check` is what CI runs (as three jobs).

## Done when: the lesson's checklist and the proof for each line

Steps 1 to 4 and the shape of step 5 can be shown on your machine; what needs GitHub itself (the real token defaults, the approval gate, a real STS refusal) has exact commands in [docs/runbook.md](docs/runbook.md). Nothing in the runbook was run while this repository was written, and the table says which proof is which.

| # | Done when (from the lesson) | Proof on this machine | Proof on GitHub |
| --- | --- | --- | --- |
| 1 | The workflow log shows your injected command ran, and you can explain why the expression was expanded before the shell saw it. | `make run`, attack 1: the vulnerable `greet.yml` gets an issue titled `Looks fine"; echo INJECTED-COMMAND-RAN; echo "` and the log has `INJECTED-COMMAND-RAN` as a line of its own (output below). **Why:** GitHub replaces `${{ ... }}` in the script text before any shell starts, so the title's quote closes the `echo` argument and what follows is a second command. | Runbook part 1: open the issue from the second account and read the log. |
| 2 | The same issue title is printed as text, not executed, and the job's token can no longer write. | `make run`, fix 1: the hardened [`greet.yml`](.github/workflows/greet.yml) prints `New issue: Looks fine"; echo INJECTED-COMMAND-RAN; echo "` as one line, and no line is just `INJECTED-COMMAND-RAN`. The workflow and the job set `permissions: {}` (asserted by `harden-lint`, which fails the build otherwise). | Runbook part 1 (the same issue again) and the "GITHUB_TOKEN Permissions" block of the run, which lists nothing. |
| 3 | You have shown the fork's code running with base-repository privileges, and you note which current safeguards in the checkout action you had to override. | `make run`, attack 2: the vulnerable `pr-build.yml` (`pull_request_target`) builds the fork's `package.json`, and the build prints `FORK CODE RAN: event=pull_request_target deploy-token-in-environment=true`. The script checks the variable's *name* only; it never reads, prints or measures the secret. **Safeguards overridden:** under `pull_request_target`, `actions/checkout` checks out the *base* commit; the workflow overrides that with `ref: ${{ github.event.pull_request.head.sha }}`, and it leaves `persist-credentials` at its default, so the job's token is written to `.git/config` where the fork's script can read it. `harden-lint` reports both (`privileged-checkout`, `persist-credentials`). | Runbook part 2, reading the run in the base repository. |
| 4 | The fork's pull request still gets a build result, and its code never runs where a secret or a write token is available. | `make run`, fix 2: the same fork change under the hardened [`pr-build.yml`](.github/workflows/pr-build.yml) (`pull_request`) still builds, with `deploy-token-in-environment=false`. The workflow references no secret at all. The result goes to [`pr-report.yml`](.github/workflows/pr-report.yml) as an artifact that a privileged workflow validates (`tests/pipeline/build-result.test.ts`) without checking out the pull request; [`label.yml`](.github/workflows/label.yml) keeps `pull_request_target` for labeling only, with no checkout. | Runbook part 2, fix. |
| 5 | A deploy job in the `production` environment gets temporary credentials after approval, and the same job from another branch or repository is refused by the trust policy. | `make infra-check`: `terraform test` (7 checks on the policy), an offline plan of 9 resources, and `make check-trust` tries eight OIDC tokens against the rendered trust policy: one assumed (repository + `production`), seven refused (branch, `main`, pull request, other environment, fork, other repository, wrong audience). Output below. | Runbook part 4: approve a deploy, then run it from another branch (the environment's branch rule stops it) and without the environment (STS says `Not authorized to perform sts:AssumeRoleWithWebIdentity`). `scripts/github-settings.sh` creates the environment with its reviewer and deletes `DEPLOY_TOKEN`. |
| 6 | Each checklist item points to the attack in your repository that it would have caught, and the checklist includes pinning actions to commit SHAs. | [docs/review-checklist.md](docs/review-checklist.md): eight questions, each with the lab file and line, the `harden-lint` rule and the test. `tests/pipeline/checklist.test.ts` fails when a named line stops matching what the linter reports. Item 5 is pinning. | |

### Attacks 1 and 2 and their fixes, with act (`make run`)

```text
== attack 1: script injection through an issue title (vulnerable greet.yml)
   [greet/greet]   | New issue: Looks fine
   [greet/greet]   | INJECTED-COMMAND-RAN
ok   the injected command ran as a line of its own
== fix 1: the same title through an environment variable (hardened greet.yml)
   [greet/greet]   | New issue: Looks fine"; echo INJECTED-COMMAND-RAN; echo "
ok   the title printed as text and no command ran
== attack 2: a fork's code under pull_request_target with the secret in scope (vulnerable pr-build.yml)
   [pr-build/build]   | FORK CODE RAN: event=pull_request_target deploy-token-in-environment=true
ok   the fork's build script ran with DEPLOY_TOKEN in its environment
== fix 2: the same fork code under pull_request, no secret (hardened pr-build.yml)
   [pr-build/build]   | FORK CODE RAN: event=pull_request deploy-token-in-environment=false
   [pr-build/build]   | artifact build-result: result.json (94 bytes), expires in 1 days
ok   the fork's code still got built, with no secret anywhere in its environment
ok   the result file was recorded for pr-report
lab: every attack worked on the vulnerable workflow and every fix held
```

### Step 5: the trust policy against eight tokens (`make check-trust`)

```text
ok   ASSUMED  approved deploy job in the environment  [repo:owner/vulnerable-demo:environment:production]  every condition holds
ok   REFUSED  same repository, a feature branch (no environment)  [repo:owner/vulnerable-demo:ref:refs/heads/feature]
ok   REFUSED  same repository, main (no environment)  [repo:owner/vulnerable-demo:ref:refs/heads/main]
ok   REFUSED  same repository, a pull request  [repo:owner/vulnerable-demo:pull_request]
ok   REFUSED  same repository, another environment  [repo:owner/vulnerable-demo:environment:staging]
ok   REFUSED  a fork's pull request  [repo:someone-else/vulnerable-demo:pull_request]
ok   REFUSED  another repository, same environment name  [repo:owner/vulnerable-demo-other:environment:production]
ok   REFUSED  right subject, wrong audience  [repo:owner/vulnerable-demo:environment:production]
check-trust: the trust policy behaves as intended

Each refusal also prints the condition that failed, for example `...:sub "repo:owner/vulnerable-demo:ref:refs/heads/feature" fails StringEquals "repo:owner/vulnerable-demo:environment:production"`.
```

### The linters on the vulnerable files (`make attack-scan`, stretch 1)

`actionlint` finds only the injection (rule `expression`); `harden-lint` finds all three attacks and more:

```text
exploit/vulnerable/.github/workflows/greet.yml:14:35: "github.event.issue.title" is potentially untrusted. avoid using it directly in inline scripts. instead, pass it through  ...
exploit/vulnerable/.github/workflows/greet.yml:12: error [missing-permissions] no permissions at the workflow or the job: the token takes the repository default, which may be  ...
exploit/vulnerable/.github/workflows/greet.yml:14: error [script-injection] github.event.issue.title is expanded into the script before the shell runs it; pass it through env  ...
exploit/vulnerable/.github/workflows/label.yml:8: error [missing-permissions] no permissions at the workflow or the job: the token takes the repository default, which may be r ...
exploit/vulnerable/.github/workflows/pr-build.yml:8: error [missing-permissions] no permissions at the workflow or the job: the token takes the repository default, which may b ...
exploit/vulnerable/.github/workflows/pr-build.yml:10: error [stored-cloud-key] secrets.DEPLOY_TOKEN is a long-lived credential; use OIDC to get temporary ones (job build)
exploit/vulnerable/.github/workflows/pr-build.yml:12: error [unpinned-action] actions/checkout@v4 is not pinned to a full commit SHA (job build)
exploit/vulnerable/.github/workflows/pr-build.yml:14: error [privileged-checkout] pull_request_target checks out the pull request's own code, which then runs with this reposit ...
exploit/vulnerable/.github/workflows/pr-build.yml:14: error [persist-credentials] checkout keeps the token in .git/config; set persist-credentials: false (job build)
harden-lint: 8 error(s), 0 warning(s)
```

## Deploy

Nothing deploys from here; you deploy when the account exists. Cost: IAM and the OIDC provider are free; the bucket costs cents per month. Teardown is one command.

```bash
cp infra/environments/demo/demo.tfvars.example infra/environments/demo/demo.tfvars    # edit it: account id, OWNER/REPO, bucket name
terraform -chdir=infra/environments/demo init
terraform -chdir=infra/environments/demo apply -var-file=demo.tfvars
DRY_RUN=1 scripts/github-settings.sh OWNER/REPO YOUR_LOGIN     # read what it will change, then run it without DRY_RUN
scripts/set-variables.sh OWNER/REPO                             # AWS_DEPLOY_ROLE_ARN, AWS_REGION, DEPLOY_BUCKET (variables, not secrets)
gh workflow run deploy.yml --ref main                           # approve it in the Actions UI when it waits
terraform -chdir=infra/environments/demo destroy -var-file=demo.tfvars                  # teardown
```

## Stretch goals

| Stretch (from the lesson) | Built? |
| --- | --- |
| Run a workflow linter or security scanner on the vulnerable version and see which weaknesses it reports. | Yes. `make attack-scan` runs `actionlint` and `harden-lint` (output above). Another scanner such as zizmor can be added the same way; see [ADR 0003](docs/adr/0003-harden-lint-beside-actionlint.md). |
| Attach build provenance attestations to an artifact and verify them before deployment. | No. It needs a GitHub repository to sign against; [ARCHITECTURE.md](ARCHITECTURE.md#how-to-extend-it) names the step and the permissions to add to `deploy.yml`. |
| Move one job to a self-hosted ephemeral runner and explain why persistent self-hosted runners are risky for public repositories. | No (no runner to host). The risk, in short: a pull request from a fork can run code on a persistent runner, which keeps its disk, its network position and any credentials of the previous job for the next one; an ephemeral, single-job runner removes the carry-over. |

## What is simplified for teaching

Only what the lesson scopes out, plus where this build differs from the lesson's text:

- **The vulnerable files are lab files, not live workflows**, kept in `exploit/` so this repository can be the hardened one. On GitHub you copy them into a separate `vulnerable-demo` repository ([runbook](docs/runbook.md)).
- **Under act, the fork is a copy of the repository.** There is no fork on GitHub to fetch from, so `scripts/lab.sh` makes a copy of the lab (or of this repository) in `build/lab/`, replaces its `build` script with the one change the lesson's fork makes ([`exploit/fork/apply-fork-change.mjs`](exploit/fork/apply-fork-change.mjs)), and points act at the copy. act copies the working directory into the container instead of running `actions/checkout` for the hardened workflow; the vulnerable workflow sets `ref:`, which act does not skip, so a stand-in step ([`exploit/stubs/fork-checkout`](exploit/stubs/fork-checkout)) replaces that one checkout and the copy is bound as the workspace. The pinned `actions/upload-artifact` is replaced by a stand-in that lists the files, because act's artifact service cannot be reached from a runner container when Docker runs in a VM. The workflows themselves are unchanged. act also has no token service, so attack 3 (the default token's scope), the labeler and the report workflow need GitHub; they are covered by lint rules and tests with fakes.
- **The lesson's step 1 workflow does not parse as written.** `run: echo "New issue: ${{ ... }}"` has a colon followed by a space inside an unquoted YAML value, which YAML reads as a nested mapping ("mapping values are not allowed in this context"). The lab files, and the fix, use a block scalar (`run: |`); behavior is identical.
- **The OIDC provider is AWS** (the lesson says "a cloud"). The same shape (subject = repository + environment) applies to Azure and Google Cloud; [ARCHITECTURE.md](ARCHITECTURE.md#how-to-extend-it) says where a sibling module goes.
- **The Terraform is validated and planned offline** (`offline = true` skips every AWS call) and tested with a mocked provider; it has not been applied. A real setup would add a remote encrypted state.
- **The application is small on purpose**: an issue greeter in four layers, so there is something real for `npm run build` and `npm test` to do.
- The vulnerable `pr-build.yml` uses `actions/checkout@v4` as the lesson writes it; every workflow in `.github/` pins full commit SHAs (checkout v7.0.1, setup-node v7.1.0, upload-artifact v7.0.2, download-artifact v8.0.2, labeler v7.0.0, configure-aws-credentials v6.3.0, setup-terraform v4.0.1).

## Project structure

```text
src/
  domain/            greeting rules: sanitizing a stranger's title, the Greeting value, the named error.
                     Imports nothing.
  application/       the GreetIssue use case and the Notifier port. Imports the domain only.
  infrastructure/    the stream adapter for the port. Imports application and domain.
  interfaces/        the command line (reads ISSUE_AUTHOR and ISSUE_TITLE). Nothing imports it.
pipeline/            workflow tools, importing nothing from src/: harden-lint, build-result, github-comments,
                     trust-policy, and their command-line entry points (*-cli.ts).
tests/
  unit/              domain, use case, command line with fake streams.
  integration/       the stream adapter on a real stream.
  e2e/               the greeter as a process, fed the injection title.
  pipeline/          the tools, the repository's own workflows, the lab files, and the checklist document.
.github/workflows/   greet, pr-build, label, pr-report, deploy (the hardened set) and ci. Pinned actions, explicit permissions.
.github/labeler.yml  the labeler's rules.
exploit/
  vulnerable/        the lesson's three vulnerable workflows and package.json (lab files).
  events/            event payloads: the injection issue, a plain issue, a fork pull request.
  stubs/             the checkout stand-in used under act.
infra/
  modules/github-oidc-role/   the role and trust policy (with tests/trust.tftest.hcl) and its README.
  modules/release-bucket/     a private, versioned, encrypted bucket and its README.
  environments/demo/          the composition, offline.tfvars, demo.tfvars.example and a README.
scripts/             lab.sh (make run), github-settings.sh, set-variables.sh, install-actionlint.sh.
docs/                review-checklist.md, runbook.md, adr/ (three decision records).
tech/                one beginner-level note per technology used here (start at tech/README.md).
ci/act-runner/       the Dockerfile of the image act uses as ubuntu-latest.
```

The dependency rule is enforced by `make lint` (ESLint `no-restricted-imports` per layer; `src` and `pipeline` never import each other).

## Troubleshooting

- **`make run` fails before the first attack:** run `make up` (it builds the runner image) and check `docker info`.
- **act cannot find a version of Node for `setup-node`:** the hardened `pr-build.yml` runs `setup-node` and `npm ci` for real; it needs network access.
- **`terraform init` downloads the AWS provider every time:** `make up` creates `~/.terraform.d/plugin-cache`; export `TF_PLUGIN_CACHE_DIR` to use it from other shells.
- **`make lint` complains about a workflow you changed:** read the `harden-lint` line; the fix is the same as in the checklist (environment variable, explicit permissions, a pinned SHA).

## Verification status (2026-10-27)

- Passed on this machine, from a fresh clone: `make check` (lint, eslint, prettier, tsc, actionlint, harden-lint, terraform fmt/validate/test, offline plan, check-trust; 90 tests passed, coverage 99%).
- Passed with `act` in Docker, on a laptop whose load average was in the dozens (the long pytest durations in the outputs above come from that): `make run` (exit 0: attacks 1 and 2 worked on the vulnerable workflows and both fixes held).
- Pending capacity: the runner image was built from this `ci/act-runner/Dockerfile` (the build client reported a deadline error after the layers were done, but the tagged image was present and was the one used), and `make up` was not re-run from a fresh clone. After Docker Desktop is restarted with free disk (Docker.raw was at its 60 GiB cap on 2026-10-28), run `make up` and then `make run`.
- Could not run anywhere here, only on GitHub: the default-token attack, the labeler, the report workflow, the approval gate and a real STS refusal (see docs/runbook.md; nothing in it was run), `scripts/github-settings.sh` and `scripts/set-variables.sh` (dry run only).

## Author and license

Written by Sumit Srivastava. Released under the MIT License, see [LICENSE](LICENSE). Changes are in [CHANGELOG.md](CHANGELOG.md).
