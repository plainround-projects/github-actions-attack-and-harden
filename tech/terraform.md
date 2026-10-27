# Terraform

## What it is

Terraform is a tool for describing cloud resources in files and letting a program create them. Instead of clicking through a cloud provider's website to make a storage bucket or a login role, you write down what should exist. Terraform compares what you wrote with what exists, works out the difference, and makes the cloud match. This idea is called **infrastructure as code**.

Words you will meet:

- **Provider**: a plugin that knows how to talk to one kind of service. Here, `hashicorp/aws` talks to Amazon Web Services.
- **Resource**: one thing to create, such as an S3 bucket or an IAM role.
- **Variable**: an input. **Output**: a value the configuration reports.
- **Module**: a folder of Terraform files used like a function, with variables in and outputs out.
- **State**: Terraform's record of what it created. Not used here (see below).
- **Plan**: the list of changes Terraform *would* make. **Apply**: actually making them.

The configuration language is HCL (see `hcl.md`).

## Why this repository uses it

Fix 5 replaces a stored cloud password with a login that GitHub proves with OIDC. For that to work, something must exist in AWS: an identity provider, a role with a **trust policy** naming exactly this repository and environment, and a bucket the role may write to. Terraform writes all of that down in reviewable files, and its test feature lets the repository check the trust policy without an AWS account.

## Where it appears

| Path | What it is |
| --- | --- |
| `infra/modules/github-oidc-role/` | The identity provider, the role with its trust policy, and the role's permissions. |
| `infra/modules/release-bucket/` | A private, versioned, encrypted S3 bucket. |
| `infra/environments/demo/` | Wires both modules together with example values. |
| `infra/modules/github-oidc-role/tests/trust.tftest.hcl` | Offline tests of the trust policy. |
| `*/.terraform.lock.hcl` | Pins the exact AWS provider version (6.70.0) with checksums. |
| `infra/environments/demo/offline.tfvars` | Placeholder values for an offline plan. |
| `Makefile`, `ci.yml` | `make infra-check`, `make plan`, `make check-trust`; CI job `infra`. |
| `.github/dependabot.yml` | A `terraform` entry for the demo directory. |

## How it works underneath

1. **`terraform init`** reads `required_providers`, downloads the provider plugin (the AWS one is hundreds of megabytes) and writes `.terraform.lock.hcl` with the exact version and checksums. With `-backend=false` it does not set up remote state storage.
2. **`terraform validate`** checks the files for syntax and for references that do not make sense, without contacting any cloud.
3. **`terraform plan`** builds a graph of resources and their dependencies (a resource that uses `aws_iam_role.deploy.id` depends on that role), asks the provider what currently exists, and prints what it would add, change or destroy. `-out=plan.bin` saves the plan.
4. **`terraform show -json plan.bin`** prints that plan as JSON, which other programs can read.
5. **`terraform apply`** carries the plan out. This repository never applies automatically.
6. **`terraform test`** runs `.tftest.hcl` files. Each `run` block executes a plan (or apply) with chosen variables and checks `assert` conditions. A **mock provider** (`mock_provider "aws" {}`) replaces the real AWS plugin with a fake that returns made-up values, so the test needs no credentials and touches nothing.
7. **`terraform fmt`** rewrites files to the standard style; `-check` only reports.

### State and why there is none here

After an apply Terraform keeps a **state** file to remember which real objects belong to which resource. State can hold secrets and must be stored safely. This repository only plans, tests and validates, so it needs no state; `*.tfstate` is in `.gitignore` in case someone applies.

### The lock file

`.terraform.lock.hcl` plays the part `package-lock.json` plays in npm: it pins the provider to `6.70.0` with checksums, so every machine uses the same plugin.

## Walkthrough of this repository's use

```hcl
terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
```

(`versions.tf` in each directory.) Terraform itself must be 1.9 or newer (this was written with 1.17). `source` says where the provider comes from. `version = "~> 6.0"` means "6.0 or newer, but below 7.0"; the lock file then fixes the exact choice.

```hcl
module "release_bucket" {
  source = "../../modules/release-bucket"

  bucket_name   = var.bucket_name
  force_destroy = true # a throwaway demo
}

module "deploy_role" {
  source = "../../modules/github-oidc-role"

  github_repository    = var.github_repository
  environment          = var.environment
  aws_account_id       = var.aws_account_id
  bucket_arn           = module.release_bucket.bucket_arn
  create_oidc_provider = var.create_oidc_provider
}
```

(`environments/demo/main.tf`.) Two module calls. The second uses an output of the first, `module.release_bucket.bucket_arn`, which tells Terraform to build the bucket first. `var.x` reads a variable. `force_destroy = true` lets a throwaway demo be deleted even if it holds files.

### The offline provider settings

```hcl
provider "aws" {
  region = var.region
  skip_credentials_validation = var.offline
  skip_requesting_account_id  = var.offline
  skip_metadata_api_check     = var.offline
  skip_region_validation      = var.offline
  access_key                  = var.offline ? "offline" : null
  secret_key                  = var.offline ? "offline" : null
  default_tags { tags = local.tags }
}
```

When `var.offline` is `true`, the provider makes no call to AWS and signs with the dummy keys `"offline"` (they are not credentials; nothing is sent). `condition ? a : b` is "if, then, else". `default_tags` puts the tags `project` and `managedBy` on every resource that supports tags. `make plan` passes `-var-file=offline.tfvars`, which sets `offline = true` and placeholder account, repository and bucket values, so the plan works anywhere. The plan says `9 to add, 0 to change, 0 to destroy`.

### Testing the trust policy

```hcl
mock_provider "aws" {}

variables {
  github_repository = "owner/vulnerable-demo"
  environment       = "production"
  aws_account_id    = "123456789012"
  bucket_arn        = "arn:aws:s3:::example-release-bucket"
}

run "the_role_trusts_one_repository_and_one_environment" {
  command = plan
  assert {
    condition     = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:owner/vulnerable-demo:environment:production"
    error_message = "the subject must name the repository and the environment exactly"
  }
```

`jsondecode` turns the policy text into a structure so the test can look inside it. The seven runs check: exact subject and audience; `StringEquals` only (`!can(...StringLike)` means "reading `StringLike` would fail"); one statement; the permission policy writes only under `releases/*` and has exactly three actions; a one-hour session; the identity provider can be left to an existing one (`create_oidc_provider = false` gives zero providers); and three bad inputs (`owner/*`, `prod*`, a bucket ARN with a path) are **refused** (`expect_failures = [var.github_repository]` passes only if validation fails).

### Validation inside the module

```hcl
variable "github_repository" {
  type = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must be OWNER/NAME with no wildcard: ..."
  }
}
```

`can(expr)` is true if the expression evaluates without error; `regex` fails when there is no match. A `*` is not in the allowed character set, so a wildcard repository is impossible to configure.

### Checking the plan against sample tokens

`make check-trust` runs `terraform show -json plan.bin > plan.json` and then `pipeline/check-trust-cli.ts`, which reads the role's rendered trust policy out of the plan and tries eight sample tokens against it (see `oidc.md`).

## Try it yourself

1. `terraform version` shows the version (this repository was checked with 1.17.0).
2. `terraform fmt -check -recursive infra; echo $?` prints `0`.
3. `make infra-check` runs format, init, the seven tests, validate, an offline plan and the eight-token check. It ends with `check-trust: the trust policy behaves as intended`. (It downloads the AWS provider on first use; set `TF_PLUGIN_CACHE_DIR`, as the Makefile does, to avoid repeated 700 MB copies.)
4. `terraform -chdir=infra/modules/github-oidc-role init -backend=false -input=false && terraform -chdir=infra/modules/github-oidc-role test` ends with `Success! 7 passed, 0 failed.`
5. In `infra/modules/github-oidc-role/main.tf`, change `sts.amazonaws.com` in the policy to another value, run the test again, and see the audience test fail; undo the change.

## Mistakes people make

- Applying without reading the plan.
- Committing state files, which can contain secrets.
- Wildcards in a trust policy.
- Letting `terraform init` copy a huge provider into every directory.
- Setting `offline = true` when applying; the dummy keys would be used for real calls.

## Check yourself

1. What is the difference between plan and apply? *(Plan lists changes; apply makes them.)*
2. What does a mock provider allow? *(Running tests with no credentials and no real resources.)*
3. What does `~> 6.0` mean? *(Version 6.0 or newer but below 7.0.)*
4. Why does the second module wait for the first? *(It uses the first one's output, so Terraform orders them.)*
5. What does `expect_failures` check? *(That the named validation does fail for the bad input.)*

## Further reading

- Terraform documentation: https://developer.hashicorp.com/terraform/docs
- `terraform test`: https://developer.hashicorp.com/terraform/language/tests
- Version constraints: https://developer.hashicorp.com/terraform/language/expressions/version-constraints
- AWS provider: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
