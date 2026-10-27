# Review checklist for any workflow change

Written from the three attacks (lesson step 6). Each question names the line of the lab that it would have caught, the
rule of `pipeline/harden-lint.ts` that asks it automatically (`make lint` runs it on every pull request), and the test
that proves the rule fires on that line. The lab files are in [`exploit/vulnerable/`](../exploit/vulnerable); the fixes
are the workflows in [`.github/workflows/`](../.github/workflows).

| # | Ask of every workflow change | Caught in the lab | Rule | Proof |
| --- | --- | --- | --- | --- |
| 1 | Does any event field (`github.event.*`, `github.head_ref`, a branch name) reach a `run:` or `script:` through `${{ }}` instead of an `env:` variable? | `exploit/vulnerable/.github/workflows/greet.yml:14`, the issue title inside `echo "..."` | `script-injection` | `tests/pipeline/harden-lint.test.ts`: "finds the injection in the lab's greet.yml"; `make run` attack 1 |
| 2 | Does a `pull_request_target` or `workflow_run` workflow check out the pull request's code (`ref:` set to the head)? Does it run any of it? | `exploit/vulnerable/.github/workflows/pr-build.yml:14`, `ref: ${{ github.event.pull_request.head.sha }}` | `privileged-checkout` | "finds the privileged checkout, the secret and the unpinned action in the lab's pr-build.yml"; `make run` attack 2 |
| 3 | Is a secret in scope of a job that runs code from a pull request? Is the build of untrusted code under `pull_request`? | `exploit/vulnerable/.github/workflows/pr-build.yml:10`, `DEPLOY_TOKEN` in the job's `env` | `stored-cloud-key` (and the trigger rule above) | same test; the hardened `pr-build.yml` has no `secrets.` at all |
| 4 | Is `permissions` explicit at the workflow or the job, and the minimum? Does any job get `write-all` or workflow-wide `write`? | `exploit/vulnerable/.github/workflows/label.yml:8`, a job with no `permissions` anywhere | `missing-permissions`, `broad-permissions` | "finds the missing permissions in the lab's label.yml" |
| 5 | Is every action pinned to a full commit SHA, with the version in a comment? | `exploit/vulnerable/.github/workflows/pr-build.yml:12`, `actions/checkout@v4`: a moved tag is the same trust problem as an injected title | `unpinned-action` | same test as 2; the repository's own workflows lint clean |
| 6 | Does every checkout set `persist-credentials: false`? | `pr-build.yml:14`: the default leaves the write token in `.git/config` where the fork's script can read it | `persist-credentials` | "persist-credentials: a checkout that keeps the token" |
| 7 | Is a cloud key stored as a secret, or an OIDC job without an `environment:`? Is the trust policy tied to the repository and the environment? | `DEPLOY_TOKEN` stands in for the key (step 5 deletes it); `deploy.yml` replaces it | `stored-cloud-key`, `oidc-without-environment` | `terraform test` and `make check-trust` try eight tokens against the planned policy |
| 8 | Does the environment have required reviewers and a branch rule, and is the default token read-only? | Not a file in the repository: repository settings | not lintable | `scripts/github-settings.sh` sets them; see the README |

`tests/pipeline/checklist.test.ts` fails when a file or line named here no longer matches what the linter reports.
