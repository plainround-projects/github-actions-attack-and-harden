# github-oidc-role

An IAM role that a GitHub Actions deploy job assumes through OIDC, plus (optionally) the account's GitHub identity
provider. There is no access key anywhere: GitHub issues a signed token to the running job, AWS checks it against the
trust policy below, and returns credentials that expire after an hour.

## The trust policy

| Condition | Value | Why |
| --- | --- | --- |
| Principal | the account's `token.actions.githubusercontent.com` provider | only tokens GitHub signed |
| `...:aud` equals | `sts.amazonaws.com` | the token was minted for AWS |
| `...:sub` equals | `repo:OWNER/NAME:environment:ENV` | one repository, one environment: a job from another branch, a pull request, a fork or another repository presents a different subject |

`StringEquals` only. The variables refuse a wildcard in the repository or the environment name.

## Inputs

| Name | Default | Meaning |
| --- | --- | --- |
| `github_repository` | | `OWNER/NAME` |
| `environment` | `production` | the GitHub environment (protect it with required reviewers) |
| `aws_account_id` | | 12 digits |
| `bucket_arn` | | the one bucket the role may write to, under `releases/` |
| `role_name` | `github-actions-deploy` | |
| `create_oidc_provider` | `true` | `false` when the account already has the GitHub provider |
| `max_session_seconds` | `3600` | |
| `tags` | `{}` | |

## Outputs

`role_arn` (set it as the repository variable `AWS_DEPLOY_ROLE_ARN`) and `subject`.

## Test

```bash
terraform -chdir=infra/modules/github-oidc-role init -backend=false
terraform -chdir=infra/modules/github-oidc-role test
```

The tests use a mocked AWS provider; no credentials or network access to AWS are needed.
