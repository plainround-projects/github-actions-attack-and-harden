# OpenID Connect (OIDC) for GitHub Actions

## What it is

OpenID Connect is a standard way for one system to **prove who someone is** to another system, using a signed message instead of a shared password. Applied to GitHub Actions, it solves this problem: a deploy job needs to log in to a cloud (AWS here) to upload files. The old way is to store a cloud access key as a secret in GitHub. That key is long-lived: if it leaks it works for months, and anything that can read the secret can use it from anywhere.

With OIDC there is no stored key:

1. The job asks GitHub for an **ID token**. GitHub makes one on the spot, just for that run.
2. The token is a signed note (a **JWT**, JSON Web Token) that says who is asking: this repository, this environment, this commit.
3. The job shows the token to the cloud. The cloud checks GitHub's signature and a **trust policy** you wrote, and if both fit, hands back **temporary credentials** that expire in an hour or less.

Think of a hotel key card instead of a master key: made when you arrive, works for a short time, and only opens the doors the hotel decided.

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **commit**: A saved snapshot of a project's files in Git, with a message and an author. Every commit has a unique 40-character name (its SHA).
- **branch**: A movable name for a line of commits in Git. `main` is the usual name of the primary line.
- **fork**: Your own copy of someone else's repository on GitHub. Strangers propose changes by changing their fork and opening a pull request from it.
- **repository**: A project's folder of files together with its complete history of changes. On GitHub, a repository is a page with those files, issues and pull requests.
- **workflow**: A GitHub Actions automation described in a YAML file under `.github/workflows/`. It names the events that start it and the jobs it runs.
- **JSON**: A plain-text format for structured data: objects `{ "name": "value" }`, lists `[1, 2]`, texts in double quotes, numbers, `true`, `false`, `null`. It has no comments.
- **variable**: A name for a place that holds a value which can be used later in the code.
- **linter**: A program that reads code without running it and reports likely mistakes or rule breaks.
- **Terraform**: A tool that creates cloud resources from files that describe them.

</details>

<!-- /words -->

## Why this repository uses it

Fix 5 of the lab. The vulnerable `pr-build.yml` had `DEPLOY_TOKEN` as a stored secret in the job's environment, where a stranger's code could read it. The hardened `deploy.yml` stores nothing. The cloud will give credentials only to a job that GitHub says belongs to this repository's `production` environment, and that environment needs a human approval first.

## Where it appears

| Path | What it does |
| --- | --- |
| `.github/workflows/deploy.yml` | `permissions: id-token: write`, `environment: production`, `aws-actions/configure-aws-credentials`. |
| `infra/modules/github-oidc-role/main.tf` | The trust policy that decides which tokens are accepted. |
| `pipeline/trust-policy.ts` | A model of how AWS judges a token, plus eight sample tokens. |
| `pipeline/check-trust-cli.ts` | Applies the model to the real planned policy. |
| `pipeline/harden-lint.ts` | Rules `stored-cloud-key` and `oidc-without-environment`. |
| `scripts/github-settings.sh`, `scripts/set-variables.sh` | Create the environment and publish the role ARN as a variable. |

## How it works underneath

### The token

A JWT is three base64 parts joined by dots: a header, a **payload** of **claims**, and a signature. The claims GitHub puts in its token include:

| Claim | Meaning | Example |
| --- | --- | --- |
| `iss` | Who issued it | `https://token.actions.githubusercontent.com` |
| `aud` | Who it is meant for | `sts.amazonaws.com` |
| `sub` | The subject: who is asking | `repo:owner/vulnerable-demo:environment:production` |
| `repository`, `ref`, `sha`, `workflow`, ... | Extra details | |

The `sub` claim is built from the job's context. The form depends on the job:

- a job with `environment: production`: `repo:OWNER/NAME:environment:production`
- a job on a branch, no environment: `repo:OWNER/NAME:ref:refs/heads/main`
- a pull request job: `repo:OWNER/NAME:pull_request`

### The exchange

1. The job requests a token from GitHub's token service (allowed only if the job has `permissions: id-token: write`), naming the audience `sts.amazonaws.com`.
2. `configure-aws-credentials` sends it to AWS STS (the Security Token Service) with the call `AssumeRoleWithWebIdentity` and the role it wants.
3. AWS verifies the signature using GitHub's public keys (found through the identity provider registered in IAM), then evaluates the role's trust policy against the claims.
4. If the policy allows, AWS returns an access key, secret and session token valid for the role's `max_session_duration` (here 3600 seconds).

### Why the environment matters

The most important line is the subject condition. If the policy only checked the repository (`repo:owner/name:*`), then any branch, any pull request and any workflow in the repository could get the role, including one a stranger changed. Requiring `environment:production` ties the login to a job that passed through the environment's gate (required reviewer, only from `main`). A fork's pull request has a different `sub` and is refused.

## Walkthrough of this repository's use

The workflow side:

```yaml
    environment: production
    permissions:
      id-token: write # lets the job request an OIDC token
      contents: read
    steps:
      ...
      - uses: aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
```

No key or password appears anywhere. `vars.X` reads a repository *variable* (plain text, set by `scripts/set-variables.sh` from the Terraform outputs). A role ARN is an address, not a credential.

The cloud side, in `infra/modules/github-oidc-role/main.tf`, is the trust policy (see `hcl.md` and `aws-iam.md`): principal = the GitHub identity provider; action = `sts:AssumeRoleWithWebIdentity`; conditions `StringEquals` on `...:aud` = `sts.amazonaws.com` and `...:sub` = `repo:<repo>:environment:<environment>`. `StringEquals` is exact; there is no wildcard.

The repository's model, `pipeline/trust-policy.ts`, checks eight tokens against the real planned policy (`make check-trust`):

| Token's `sub` (and `aud`) | Result |
| --- | --- |
| `repo:owner/vulnerable-demo:environment:production` | **ASSUMED** |
| `...:ref:refs/heads/feature` | REFUSED |
| `...:ref:refs/heads/main` (no environment) | REFUSED |
| `...:pull_request` | REFUSED |
| `...:environment:staging` | REFUSED |
| `repo:someone-else/vulnerable-demo:pull_request` (a fork) | REFUSED |
| `repo:owner/vulnerable-demo-other:environment:production` | REFUSED |
| right `sub`, `aud` = `sts.example.invalid` | REFUSED |

`evaluate()` returns the *reason*, such as `token.actions.githubusercontent.com:sub "repo:...:ref:refs/heads/main" fails StringEquals "repo:owner/vulnerable-demo:environment:production"`.

The linter rule `oidc-without-environment` warns about a job with `id-token: write` and no `environment`, because then the trust policy cannot require an approval. `stored-cloud-key` flags `secrets.AWS_...KEY`, `...CREDENTIALS`, `DEPLOY_TOKEN` and similar.

`scripts/github-settings.sh` creates the `production` environment with a required reviewer and a deployment branch policy limited to `main`, and deletes the old `DEPLOY_TOKEN` secret.

## Try it yourself

1. `make check-trust` (needs Terraform; see `terraform.md`) prints eight lines starting `ok` and ends with `check-trust: the trust policy behaves as intended`.
2. `npx vitest run tests/pipeline/trust-policy.test.ts` runs the model's tests.
3. Decode a JWT payload yourself: `echo 'eyJzdWIiOiJyZXBvOm93bmVyL3g6ZW52aXJvbm1lbnQ6cHJvZHVjdGlvbiJ9' | base64 -d` prints `{"sub":"repo:owner/x:environment:production"}`. (Real tokens have three parts; the middle one is this kind of text.)
4. `grep -n "id-token" .github/workflows/*.yml` shows that only `deploy.yml` can request a token.
5. `npx tsx pipeline/harden-lint-cli.ts exploit/vulnerable/.github/workflows | grep stored-cloud-key` shows the stored key being flagged.

## Mistakes people make

- A trust policy that checks only the repository, or uses a wildcard such as `repo:owner/name:*`.
- Giving `id-token: write` to every job instead of the deploy job.
- Forgetting the audience condition.
- Sharing one role among repositories.
- Treating the environment as decoration: without required reviewers or branch rules, it is not a gate.

## Check yourself

1. What replaces the stored key? *(A short-lived token from GitHub exchanged for temporary cloud credentials.)*
2. What is the `sub` claim? *(The subject: which repository and which environment, branch or pull request is asking.)*
3. Why must the policy name the environment? *(So only a job that passed the environment's approval gate can log in.)*
4. What does `id-token: write` do? *(Lets the job request the token; it grants nothing else.)*
5. Why is a role ARN stored as a variable and not a secret? *(It is an address; knowing it gives no access without a valid token.)*

## Further reading

- GitHub, OpenID Connect in AWS: https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws
- OIDC reference and claims: https://docs.github.com/en/actions/reference/security/oidc
- AWS, `AssumeRoleWithWebIdentity`: https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html
- JSON Web Tokens: https://www.rfc-editor.org/rfc/rfc7519
