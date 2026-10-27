# AWS IAM: roles, policies and trust policies

## What it is

AWS IAM (Identity and Access Management) decides **who may do what** in an Amazon Web Services account. Its building blocks:

- **Principal**: whoever is acting (a person, a program, a role).
- **Action**: one operation, written `service:Operation`, for example `s3:PutObject` (upload a file).
- **Resource**: the thing acted on, named by an **ARN** (Amazon Resource Name), a long identifier such as `arn:aws:s3:::my-bucket/releases/*`.
- **Policy**: a JSON document listing **statements**. A statement has an `Effect` (`Allow` or `Deny`), `Action`s, `Resource`s and optional `Condition`s.
- **Role**: an identity with no password of its own. Something else **assumes** it (puts it on temporarily) and receives short-lived credentials.

A role has two kinds of policy, and mixing them up is the most common confusion:

| Policy | Question it answers | Where in this repository |
| --- | --- | --- |
| **Trust policy** (`assume_role_policy`) | *Who may become this role?* | `aws_iam_role.deploy` |
| **Permissions policy** | *What may the role do once someone is it?* | `aws_iam_role_policy.deploy` |

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **regex**: Short for regular expression: a compact pattern that describes text, such as `^[0-9]{12}$` (exactly twelve digits).
- **repository**: A project's folder of files together with its complete history of changes. On GitHub, a repository is a page with those files, issues and pull requests.
- **URL**: A web address such as `https://api.github.com/zen`.
- **JSON**: A plain-text format for structured data: objects `{ "name": "value" }`, lists `[1, 2]`, texts in double quotes, numbers, `true`, `false`, `null`. It has no comments.
- **token**: A secret text that proves who is asking when a program talks to a service, instead of a password. Tokens can be limited in what they may do and in how long they last.
- **module**: A file, or a folder of files, that other code can load and use. In Terraform, a module is a folder of configuration used like a function.
- **list**: An ordered collection of values written one after another.
- **test**: A small program that uses your code and checks that the answer is the one you expected.
- **Terraform**: A tool that creates cloud resources from files that describe them.

</details>

<!-- /words -->

## Why this repository uses it

The deploy job needs to put files in one bucket. IAM is how that is allowed narrowly: a role that only a particular GitHub job can assume (the trust policy) and that can do only a few things in a single place (the permissions policy). This is the **principle of least privilege**: give only what is needed.

## Where it appears

| Path | What it is |
| --- | --- |
| `infra/modules/github-oidc-role/main.tf` | The identity provider, the role, the two policies. |
| `infra/modules/github-oidc-role/variables.tf` | Inputs with validation. |
| `pipeline/trust-policy.ts` | A model of how AWS evaluates the trust policy. |
| `tests/pipeline/trust-policy.test.ts` | Tests of that model. |
| `.github/workflows/deploy.yml` | Assumes the role with `configure-aws-credentials`. |

## How it works underneath

### Evaluation

When a request arrives, AWS gathers the policies that apply and decides:

1. Everything is denied by default.
2. An explicit `Deny` anywhere wins.
3. Otherwise, an `Allow` that matches the principal, action, resource and every condition lets the request through.

For `AssumeRoleWithWebIdentity`, the trust policy is the one consulted. Its `Principal` is `{ Federated: <identity provider ARN> }`, meaning "a user vouched for by that outside identity provider". The `Condition` block compares claims in the token (see `oidc.md`) using **operators**:

- `StringEquals`: exact match.
- `StringLike`: match with `*` (any run of characters) and `?` (one character).

All conditions in a statement must hold (AND). A key that is missing from the token makes the condition false.

### The OIDC identity provider

IAM has to know that GitHub's token issuer is trusted. An `aws_iam_openid_connect_provider` registers the issuer URL (`https://token.actions.githubusercontent.com`) and the accepted audience (`sts.amazonaws.com`). An account can have only one provider per URL.

### Session length

The credentials from `AssumeRoleWithWebIdentity` expire after the role's `max_session_duration`: 3600 seconds (the AWS minimum) here.

## Walkthrough of this repository's use

The trust policy (rendered by `jsonencode` in `main.tf`; the real output sorts the keys alphabetically and has no line breaks, shown here in reading order):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:owner/vulnerable-demo:environment:production"
      }
    }
  }]
}
```

`Version` is the policy language version (always this date). One statement. The principal is the GitHub provider of one account. Two conditions, both exact. There is no `StringLike` and no `*`, and a Terraform test says so.

The permissions policy:

```hcl
Statement = [
  {
    Sid      = "WriteReleases"
    Effect   = "Allow"
    Action   = ["s3:PutObject", "s3:AbortMultipartUpload"]
    Resource = "${var.bucket_arn}/releases/*"
  },
  {
    Sid       = "ListReleases"
    Effect    = "Allow"
    Action    = "s3:ListBucket"
    Resource  = var.bucket_arn
    Condition = { StringLike = { "s3:prefix" = ["releases/*"] } }
  },
]
```

`Sid` is a label. The first statement allows uploading (and cancelling a half-finished upload) only to keys that start with `releases/` in one bucket. The second lets the role list the bucket, but only for the prefix `releases/*`, which `aws s3 sync` needs. No `s3:*`, no `Resource = "*"`, no delete. A test asserts "exactly PutObject, AbortMultipartUpload and ListBucket".

Input protection in `variables.tf`: `aws_account_id` must be exactly 12 digits; `github_repository` must be `OWNER/NAME` without a wildcard; `environment` has no wildcard; `bucket_arn` must be the ARN of one bucket, not an object path or wildcard.

`pipeline/trust-policy.ts` `evaluate()`: skip any statement that is not `Allow`, not for `sts:AssumeRoleWithWebIdentity`, or not for this provider; compare each condition; if an operator is unknown, treat it as *not matching* ("fails closed"); allow only when no condition failed. `likeToRegExp` turns `*` into `.*` and `?` into `.` after escaping every regex special character, so `.` in a name means a literal dot.

## Try it yourself

1. `terraform -chdir=infra/environments/demo show -json plan.bin | jq -r '.planned_values.root_module.child_modules[].resources[] | select(.type=="aws_iam_role") | .values.assume_role_policy' | jq .` prints the trust policy (run `make plan` first, which writes `plan.bin`).
2. `npx vitest run tests/pipeline/trust-policy.test.ts` runs the evaluator's tests.
3. `grep -n "StringLike\|\*" infra/modules/github-oidc-role/main.tf` shows the only wildcards: the `releases/*` paths in the *permissions* policy (none in the trust policy).
4. `terraform -chdir=infra/modules/github-oidc-role test` runs the seven policy tests.
5. In `infra/environments/demo/offline.tfvars` change `github_repository` to `owner/*` and run `make plan`; Terraform stops with the module's validation message. Undo the change.

## Mistakes people make

- Confusing the trust policy and the permissions policy.
- `Action = "*"` or `Resource = "*"` because it was quicker.
- A trust policy with `StringLike` and a `*` in the `sub`.
- Sharing one broad role among many repositories.
- Forgetting that `ListBucket` is checked against the bucket ARN, while `PutObject` is checked against object ARNs.

## Check yourself

1. What does the trust policy decide? *(Who may assume the role.)*
2. What is an ARN? *(A unique name for an AWS resource.)*
3. Why is there both `WriteReleases` and `ListReleases`? *(Different actions apply to different resource forms: objects versus the bucket.)*
4. What does "fails closed" mean in `trust-policy.ts`? *(Anything it does not understand counts as no match.)*
5. What is least privilege? *(Granting only the actions and resources a job needs.)*

## Further reading

- IAM policy elements: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html
- IAM roles: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html
- Condition operators: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition_operators.html
- Terraform `aws_iam_role`: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role
