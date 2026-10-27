# GitHub CLI (`gh`)

## What it is

`gh` is GitHub's official command-line program. After you sign in once (`gh auth login`), it sends requests to GitHub for you. `gh api PATH` sends any request to GitHub's REST API.

## Why this repository uses it

The hardened workflows assume settings that live on GitHub, not in files: the default token is read-only, actions must be pinned, outside contributors need approval, and a `production` environment exists with a required reviewer. `scripts/github-settings.sh` sets them with `gh` so the setup is written down and repeatable, and `scripts/set-variables.sh` publishes Terraform outputs as repository variables. Both have a dry-run mode.

## Where it appears

| Path | What it does with gh |
| --- | --- |
| `scripts/github-settings.sh` | Five numbered steps: `gh api` calls and `gh secret delete`. |
| `scripts/set-variables.sh` | `gh variable set` three times. |
| `docs/runbook.md` | The by-hand steps for the real attacks (switching between two accounts with `gh auth switch`). |

## How it works underneath

`gh` keeps a token from `gh auth login` and turns each command into an HTTPS request to `api.github.com`. `-X METHOD` sets the HTTP method (GET reads, PUT replaces, POST creates). `-f key=value` sends a text field; `-F key=value` sends a typed field (`true` becomes a JSON boolean). `--input FILE` sends a file as the body. A key ending in `[]`, like `patterns_allowed[]`, means "add one item to a list".

## Walkthrough of this repository's use

### The `api` command

`gh api` calls any GitHub REST endpoint using your signed-in credentials. `-X PUT` picks the HTTP method. `-f name=value` sends a string field; `-F name=value` sends a typed field (`true`, `false`, a number). `--jq .id` filters the answer. `--input -` takes the request body from standard input.

```bash
gh api -X PUT "repos/$repo/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
```

Step 1: the default `GITHUB_TOKEN` is read-only (the cure for attack 3), and Actions may not approve pull requests.

```bash
gh api -X PUT "repos/$repo/actions/permissions" \
  -F enabled=true -f allowed_actions=all -F sha_pinning_required=true
```

Step 2: Actions are on, any action may be used, but each must be pinned to a full commit SHA.

```bash
gh api -X PUT "repos/$repo/actions/permissions/fork-pr-contributor-approval" \
  -f approval_policy=all_external_contributors
```

Step 3: every pull request from an outside contributor waits for a maintainer's approval before its workflows run.

```bash
reviewer_id="$(gh api "users/$reviewer" --jq .id)"
gh api -X PUT "repos/$repo/environments/production" --input - <<JSON
{ "wait_timer": 0, "prevent_self_review": false,
  "reviewers": [{ "type": "User", "id": $reviewer_id }],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
gh_api -X POST "repos/$repo/environments/production/deployment-branch-policies" -f name=main -f type=branch
```

Step 4: look up the reviewer's numeric id, create the `production` environment with that required reviewer, allow deployments from custom branch patterns only, and add the pattern `main`. The two branch-policy flags must be opposites, as the API documentation says.

```bash
gh secret delete DEPLOY_TOKEN --repo "$repo" || echo "   (no DEPLOY_TOKEN secret to delete)"
```

Step 5: delete the stored key that OIDC replaces; `||` keeps the script going when the secret is already gone.

`set-variables.sh`:

```bash
value="$(terraform -chdir="$env_dir" output -raw "$output")"
gh variable set "$name" --repo "$repo" --body "$value"
```

`terraform output -raw NAME` prints one output without quotes. `gh variable set` creates or updates a repository **variable** (plain text, not a secret): `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `DEPLOY_BUCKET`.

### Dry run

With `DRY_RUN=1`, `gh_api` prints the command instead of running it, so you can read exactly what would change before a real run.

### What was checked

The endpoints, methods and field names for steps 1 to 3 and the environment call were compared with GitHub's REST documentation while writing these notes (default workflow permissions, Actions permissions with `sha_pinning_required`, fork contributor approval, create or update an environment). The endpoint for the deployment branch policy (`POST .../deployment-branch-policies` with `name` and `type`) could not be confirmed from the page consulted. None of the calls has been run against a real repository.

## Try it yourself

1. `gh --version` prints the version; `gh auth status` shows whether you are signed in.
2. `DRY_RUN=1 scripts/github-settings.sh owner/repo octocat` prints the numbered steps and the `gh api` lines; nothing changes and no sign-in is needed.
3. `DRY_RUN=1 scripts/set-variables.sh owner/repo` prints the three `gh variable set` lines.
4. `gh api --help | head -20` explains `-f`, `-F`, `--jq` and `--input`.
5. With sign-in, a harmless read: `gh api repos/cli/cli --jq .stargazers_count` prints a number.

## Mistakes people make

- Running the real script against the wrong repository. Use the dry run first.
- Mixing up `-f` and `-F`: `-f can_approve=false` would send the string "false".
- Granting a token more admin scope than the task needs.
- Believing the script was tested end to end: it was only dry-run here.
- Deleting a secret before the replacement (OIDC) works.

## Check yourself

1. What does `-X PUT` mean? *(An HTTP PUT request, which sets a resource's settings.)*
2. `-f` versus `-F`? *(`-f` sends a string; `-F` sends a typed value such as `true`.)*
3. What does `sha_pinning_required` do? *(GitHub refuses runs that use an action by tag instead of full commit SHA.)*
4. What does `DRY_RUN=1` do here? *(Prints the calls without sending them.)*
5. Why are the role ARN and bucket variables and not secrets? *(They are addresses; they give no access by themselves.)*

## Further reading

- GitHub CLI manual: https://cli.github.com/manual/
- Repository Actions permissions API: https://docs.github.com/en/rest/actions/permissions
- Environments API: https://docs.github.com/en/rest/deployments/environments
