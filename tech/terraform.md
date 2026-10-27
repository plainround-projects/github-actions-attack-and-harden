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

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **checksum**: A short fingerprint computed from a file's content. If one byte changes the fingerprint changes, so comparing fingerprints shows whether a file is the one you expected.
- **CI**: Continuous integration: running checks (build, tests, linters) automatically every time code changes.
- **JSON**: A plain-text format for structured data: objects `{ "name": "value" }`, lists `[1, 2]`, texts in double quotes, numbers, `true`, `false`, `null`. It has no comments.
- **HCL**: HashiCorp Configuration Language: the file format of Terraform, made of blocks and `name = value` arguments.
- **lock file**: A file that records the exact version, and a checksum, of every package that was installed, so that everyone installs exactly the same thing.
- **function**: A named piece of code that takes inputs (parameters), does something, and may return a result.
- **list**: An ordered collection of values written one after another.
- **folder**: A container for files and other folders on disk (also called a directory).
- **ARN**: Amazon Resource Name: a unique text address for one thing in AWS, such as `arn:aws:s3:::my-bucket`.
- **test**: A small program that uses your code and checks that the answer is the one you expected.
- **mock**: A stand-in object used in a test in place of the real thing.

</details>

<!-- /words -->

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

### Every other Terraform file, one by one

**The demo environment's inputs, `infra/environments/demo/variables.tf`.** A `variable` block declares an input. Its `type` says what kind of value it takes; `default` is used when no value is given; `description` documents it.

| Variable | Type | Default | Meaning |
| --- | --- | --- | --- |
| `region` | string | `"us-east-1"` | The AWS region (a geographic location with its own data centres) in which to create resources. |
| `aws_account_id` | string | none (required) | The 12-digit number that names your AWS account. It goes into the identity provider's ARN. |
| `github_repository` | string | none (required) | `OWNER/NAME` of the repository whose `production` environment may deploy. |
| `environment` | string | `"production"` | The GitHub environment a deploy job must run in. |
| `bucket_name` | string | none (required) | The globally unique name of the release bucket. |
| `create_oidc_provider` | bool | `true` | Whether to create the account's GitHub identity provider; set `false` if the account already has one. |
| `offline` | bool | `false` | When `true`, the provider makes no call to AWS so `plan` works with no account. "Never true when applying." |

A variable without a `default` must be given a value, either by `-var name=value`, by a `-var-file`, or by answering a prompt.

**The module outputs.** An `output` block publishes a value after the configuration is evaluated.

`infra/modules/github-oidc-role/outputs.tf`:

```hcl
output "role_arn" {
  description = "Set this as the repository variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}

output "subject" {
  description = "The only OIDC subject the role trusts."
  value       = local.subject
}
```

`role_arn` is the address of the role (an ARN: a unique name for an AWS thing). `subject` is the text `repo:<repository>:environment:<environment>` that the trust policy requires.

`infra/modules/release-bucket/outputs.tf` publishes the bucket's name and ARN (`bucket_name`, `bucket_arn`), which the demo environment passes to the role module. `infra/environments/demo/outputs.tf` re-publishes four values for people and scripts: `deploy_role_arn` (becomes the repository variable `AWS_DEPLOY_ROLE_ARN`), `deploy_bucket` (`DEPLOY_BUCKET`), `trusted_subject` (so you can read what the role accepts), and `region` (`AWS_REGION`). `scripts/set-variables.sh` reads three of them with `terraform output -raw`.

**The release-bucket inputs, `infra/modules/release-bucket/variables.tf`.** `bucket_name` has a validation: `can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_name))`, which means 3 to 63 characters, lower-case letters, digits, dots or hyphens, starting and ending with a letter or digit (S3's naming rules). `force_destroy` (bool, default `false`) allows deleting a bucket that still contains files. `noncurrent_version_days` (number, default `30`) sets how long old versions are kept. `tags` (a `map(string)`, default `{}`) are labels put on the bucket.

**The role module's inputs, `infra/modules/github-oidc-role/variables.tf`.** `github_repository` (validated as `OWNER/NAME` with no wildcard); `environment` (default `production`, validated without wildcard); `aws_account_id` (exactly 12 digits); `role_name` (default `github-actions-deploy`); `bucket_arn` (validated as the ARN of one bucket, with no path); `create_oidc_provider` (default `true`); `max_session_seconds` (default 3600, the shortest AWS allows); `tags` (default `{}`).

**The three `versions.tf` files** are identical: Terraform 1.9 or newer, and the AWS provider `~> 6.0`.

**The `.terraform.lock.hcl` files** (one per directory that is initialised: the demo environment and the two modules). Each records the provider chosen at `terraform init`:

```hcl
provider "registry.terraform.io/hashicorp/aws" {
  version     = "6.70.0"
  constraints = "~> 6.0"
  hashes = [
    "h1:...",
    "zh:...",
  ]
}
```

`version` is the exact release used. `constraints` repeats the allowed range from `versions.tf`. `hashes` are checksums of the provider's files; `zh:` entries are checksums of the downloadable archives and `h1:` is a checksum of the unpacked contents. Terraform refuses a plugin whose checksum does not match. The file is written by `terraform init`; do not edit it by hand.

**The `.tfvars` files.** `infra/environments/demo/offline.tfvars` supplies placeholder values for the offline plan: `offline = true`, a fake account id (`123456789012`), the repository `owner/vulnerable-demo`, and a bucket name. `infra/environments/demo/demo.tfvars.example` is a template for real use: copy it to `demo.tfvars` (which `.gitignore` excludes), fill in your own account id, repository and a unique bucket name, and set `create_oidc_provider = false` if the account already has the GitHub provider.

**The READMEs** inside `infra/` repeat these steps for people who open only that folder.

### The commands in `make infra-check` and `make plan`

| Command | What it does |
| --- | --- |
| `terraform fmt -check -recursive infra` | Reports any `.tf` file that is not in the canonical layout; `-recursive` includes sub-folders. |
| `terraform -chdir=DIR init -backend=false -input=false` | Downloads the provider into `DIR` (or links it from the plugin cache); `-backend=false` skips setting up a place to keep state; `-input=false` never asks questions. |
| `terraform -chdir=infra/modules/github-oidc-role test` | Runs `tests/trust.tftest.hcl`. |
| `terraform -chdir=DIR validate` | Checks syntax and references without any cloud call. |
| `terraform -chdir=infra/environments/demo plan -var-file=offline.tfvars -input=false -out=plan.bin` | Computes the changes using the placeholder values; `-out` saves the plan to a file. |
| `terraform -chdir=... show -json plan.bin` | Prints the saved plan as JSON, which `pipeline/check-trust-cli.ts` reads. |

`TF_PLUGIN_CACHE_DIR` (set in the Makefile to `~/.terraform.d/plugin-cache`) is a folder where Terraform keeps one copy of each downloaded provider and links to it, instead of copying the large AWS provider into every directory.

<!-- walk:infra/environments/demo/variables.tf -->
### `infra/environments/demo/variables.tf`, line by line

Lines 1 to 5:

```hcl
variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}
```

`variable "region"` declares an input named `region`. `description` documents it, `type = string` says it is text, `default = "us-east-1"` is used when nobody gives another value. `us-east-1` is the AWS region in northern Virginia, where the global IAM service is administered and where many demos live.

Lines 7 to 15:

```hcl
variable "aws_account_id" {
  description = "The 12-digit account to deploy into."
  type        = string
}

variable "github_repository" {
  description = "OWNER/NAME of the GitHub repository whose production environment deploys."
  type        = string
}
```

`aws_account_id` and `github_repository` have a type and a description but **no default**, so Terraform will not plan without a value. The account id is the 12-digit number of your AWS account; the repository is written `OWNER/NAME`.

Lines 17 to 21:

```hcl
variable "environment" {
  description = "The GitHub environment the deploy job runs in."
  type        = string
  default     = "production"
}
```

`environment` defaults to `production`, the name of the GitHub environment that gates the deploy job.

Lines 23 to 26:

```hcl
variable "bucket_name" {
  description = "Globally unique name of the release bucket."
  type        = string
}
```

`bucket_name`: the bucket's name must be unique among all AWS customers, so there is no default.

Lines 28 to 32:

```hcl
variable "create_oidc_provider" {
  description = "Create the account's GitHub identity provider; false when the account already has one."
  type        = bool
  default     = true
}
```

`create_oidc_provider`, a `bool` (true or false), default `true`. An AWS account can hold only one identity provider per URL; set it to `false` if the account already trusts GitHub.

Lines 34 to 38:

```hcl
variable "offline" {
  description = "Skip every call to AWS so `terraform plan` runs without credentials. Never true when applying."
  type        = bool
  default     = false
}
```

`offline`, a `bool`, default `false`. Its description says it all: skip every call to AWS so `plan` runs without credentials, never `true` when applying. See `main.tf` for the effect.

<!-- /walk:infra/environments/demo/variables.tf -->

<!-- walk:infra/environments/demo/outputs.tf -->
### `infra/environments/demo/outputs.tf`, line by line

Lines 1 to 19:

```hcl
output "deploy_role_arn" {
  description = "Repository variable AWS_DEPLOY_ROLE_ARN."
  value       = module.deploy_role.role_arn
}

output "deploy_bucket" {
  description = "Repository variable DEPLOY_BUCKET."
  value       = module.release_bucket.bucket_name
}

output "trusted_subject" {
  description = "The only OIDC subject the role accepts."
  value       = module.deploy_role.subject
}

output "region" {
  description = "Repository variable AWS_REGION."
  value       = var.region
}
```

Four `output` blocks. An output is a named value that Terraform prints after an apply (and that scripts can read with `terraform output -raw NAME`). `deploy_role_arn` is the ARN of the role (module output `role_arn`); `deploy_bucket` is the bucket's name; `trusted_subject` is the one OIDC subject the role accepts, so you can read what is trusted; `region` repeats the input so `scripts/set-variables.sh` can publish it. `module.deploy_role.role_arn` means "the output `role_arn` of the module called `deploy_role`".

<!-- /walk:infra/environments/demo/outputs.tf -->

<!-- walk:infra/environments/demo/main.tf -->
### `infra/environments/demo/main.tf`, line by line

Lines 1 to 16:

```hcl
provider "aws" {
  region = var.region

  # With offline = true the provider makes no call to AWS, so `plan` works without an account. The dummy keys exist
  # only so the provider has something to sign with; they are not credentials and nothing is sent.
  skip_credentials_validation = var.offline
  skip_requesting_account_id  = var.offline
  skip_metadata_api_check     = var.offline
  skip_region_validation      = var.offline
  access_key                  = var.offline ? "offline" : null
  secret_key                  = var.offline ? "offline" : null

  default_tags {
    tags = local.tags
  }
}
```

The AWS **provider** block configures the plugin that talks to AWS. `region = var.region` uses the input. The comment explains the offline mode: when `var.offline` is true the provider makes no call to AWS, because the four `skip_...` switches turn off the credential check, the account-id lookup, the metadata-service check and the region check; and the keys are the dummy text `"offline"` so that the provider has something to sign with (`condition ? "offline" : null` gives the dummy keys only offline; `null` means "not set"). They are not credentials and nothing is sent. `default_tags` puts the tags from `local.tags` on every resource that can have tags.

Lines 18 to 23:

```hcl
locals {
  tags = {
    project   = "attack-and-harden"
    managedBy = "terraform"
  }
}
```

`locals` defines named values used in the same module: two tags, `project` and `managedBy`.

Lines 25 to 40:

```hcl
module "release_bucket" {
  source = "../../modules/release-bucket"

  bucket_name   = var.bucket_name
  force_destroy = true # a throwaway demo: `terraform destroy` must not stop on a release object
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

Two **module calls**. A module is a folder of Terraform files used like a function: `source` is the folder, the other arguments are its variables. `release_bucket` makes the bucket (and passes `force_destroy = true`, explained in the comment: a throwaway demo must be destroyable). `deploy_role` makes the identity provider, the role and its policies; `bucket_arn = module.release_bucket.bucket_arn` uses the first module's output, which also tells Terraform to create the bucket first.

<!-- /walk:infra/environments/demo/main.tf -->

<!-- walk:infra/modules/github-oidc-role/variables.tf -->
### `infra/modules/github-oidc-role/variables.tf`, line by line

Lines 1 to 20:

```hcl
variable "github_repository" {
  description = "The repository whose workflows may assume the role, as OWNER/NAME."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must be OWNER/NAME with no wildcard: a trust policy that names no single repository trusts every one."
  }
}

variable "environment" {
  description = "The GitHub environment a job must run in to assume the role. Its required reviewers must approve first."
  type        = string
  default     = "production"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+$", var.environment))
    error_message = "environment must be a plain name with no wildcard."
  }
}
```

`github_repository` has a **validation**: `condition = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))`. `regex(pattern, text)` fails with an error when the text does not match, and `can(expression)` turns "this expression has an error" into `false`. So the condition is true only for text shaped `OWNER/NAME` with letters, digits, `_`, `.` or `-` on each side. A `*` is not in that set, so a wildcard can never be configured; the `error_message` explains why (a policy that names no single repository trusts every one). `environment` (default `production`) has the same kind of check without the slash.

Lines 22 to 30:

```hcl
variable "aws_account_id" {
  description = "The 12-digit account that owns the role and the identity provider."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be 12 digits."
  }
}
```

`aws_account_id` must be exactly twelve digits: `^[0-9]{12}$`.

Lines 32 to 36:

```hcl
variable "role_name" {
  description = "Name of the IAM role the deploy job assumes."
  type        = string
  default     = "github-actions-deploy"
}
```

`role_name`, default `github-actions-deploy`: the name of the IAM role.

Lines 38 to 46:

```hcl
variable "bucket_arn" {
  description = "ARN of the bucket the deploy job may write to, under the releases/ prefix only."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_arn))
    error_message = "bucket_arn must be the ARN of one bucket, with no object path or wildcard."
  }
}
```

`bucket_arn` must look like the ARN of one bucket: `arn:aws:s3:::` followed by a bucket name of the S3 shape, and nothing after it. A path or a `*` fails the pattern, so the role can never be pointed at "all objects" by mistake.

Lines 48 to 52:

```hcl
variable "create_oidc_provider" {
  description = "Create the account's GitHub identity provider. Set false when the account already has one (only one per URL is allowed)."
  type        = bool
  default     = true
}
```

`create_oidc_provider` (bool, default `true`): see the demo environment's variable of the same name.

Lines 54 to 58:

```hcl
variable "max_session_seconds" {
  description = "How long the temporary credentials last. The default is the AWS minimum, one hour."
  type        = number
  default     = 3600
}
```

`max_session_seconds` (number, default `3600`): how long the temporary credentials last. One hour is the shortest AWS allows.

Lines 60 to 64:

```hcl
variable "tags" {
  description = "Tags for the resources that support them."
  type        = map(string)
  default     = {}
}
```

`tags`, a `map(string)` (an object from text keys to text values), default `{}` (empty), put on the resources that can be tagged.

<!-- /walk:infra/modules/github-oidc-role/variables.tf -->

<!-- walk:infra/modules/github-oidc-role/main.tf -->
### `infra/modules/github-oidc-role/main.tf`, line by line

Lines 18 to 24:

```hcl
# The trust policy: only a token issued by GitHub, for this audience, whose subject names this repository and this

# environment. A job from another branch, another repository or a fork presents a different subject and is refused.

resource "aws_iam_role" "deploy" {
  name                 = var.role_name
  description          = "Assumed by the ${var.environment} deploy job of ${var.github_repository} through GitHub OIDC."
  max_session_duration = var.max_session_seconds
  tags                 = var.tags
```

The comment states the idea of the trust policy. The role resource's first arguments: `name`, a `description` built with `${...}` placeholders that insert the environment and repository, `max_session_duration` (seconds the temporary credentials last), and `tags`.

Lines 44 to 47:

```hcl
# Least privilege: write objects under releases/ in one bucket, list that prefix, nothing else.

resource "aws_iam_role_policy" "deploy" {
  name = "release-upload"
  role = aws_iam_role.deploy.id
```

The second resource is an **inline policy** attached to the role (`aws_iam_role_policy`): `name` is its label, and `role = aws_iam_role.deploy.id` attaches it to the role above. The comment above it states the principle: least privilege.

<!-- /walk:infra/modules/github-oidc-role/main.tf -->

<!-- walk:infra/modules/release-bucket/variables.tf -->
### `infra/modules/release-bucket/variables.tf`, line by line

Lines 1 to 9:

```hcl
variable "bucket_name" {
  description = "Globally unique bucket name."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "bucket_name must be 3 to 63 lowercase letters, digits, dots or hyphens."
  }
}
```

`bucket_name`: validated as 3 to 63 characters of lower-case letters, digits, dots and hyphens, beginning and ending with a letter or digit.

Lines 11 to 15:

```hcl
variable "force_destroy" {
  description = "Let `terraform destroy` delete the bucket even when it holds objects. True only for throwaway environments."
  type        = bool
  default     = false
}
```

`force_destroy` (bool, default `false`): whether `terraform destroy` may delete a bucket that still holds files. The description says to set it `true` only for throwaway environments.

Lines 17 to 21:

```hcl
variable "noncurrent_version_days" {
  description = "Days an overwritten or deleted object version is kept."
  type        = number
  default     = 30
}
```

`noncurrent_version_days` (number, default `30`): how many days a previous version of an object is kept.

Lines 23 to 27:

```hcl
variable "tags" {
  description = "Tags for the bucket."
  type        = map(string)
  default     = {}
}
```

`tags` (map of text, default empty).

<!-- /walk:infra/modules/release-bucket/variables.tf -->

<!-- walk:infra/modules/release-bucket/outputs.tf -->
### `infra/modules/release-bucket/outputs.tf`, line by line

Lines 1 to 9:

```hcl
output "bucket_arn" {
  description = "ARN of the bucket."
  value       = aws_s3_bucket.this.arn
}

output "bucket_name" {
  description = "Name of the bucket; set it as the repository variable DEPLOY_BUCKET."
  value       = aws_s3_bucket.this.bucket
}
```

Two outputs for the other module and for people: `bucket_arn` (the bucket's address in ARN form, used by the role's policy) and `bucket_name`.

<!-- /walk:infra/modules/release-bucket/outputs.tf -->

<!-- walk:infra/modules/release-bucket/main.tf -->
### `infra/modules/release-bucket/main.tf`, line by line

Lines 33 to 38:

```hcl

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
```

The encryption setting's nested blocks: `rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }` means every new object is encrypted at rest with keys that S3 manages.

<!-- /walk:infra/modules/release-bucket/main.tf -->

<!-- walk:infra/modules/github-oidc-role/tests/trust.tftest.hcl -->
### `infra/modules/github-oidc-role/tests/trust.tftest.hcl`, line by line

Lines 1 to 10:

```hcl
# Offline tests of the trust policy: `terraform test` with a mocked AWS provider, no credentials.

mock_provider "aws" {}

variables {
  github_repository = "owner/vulnerable-demo"
  environment       = "production"
  aws_account_id    = "123456789012"
  bucket_arn        = "arn:aws:s3:::example-release-bucket"
}
```

A comment says what the file is. `mock_provider "aws" {}` replaces the real AWS plugin with a fake that returns made-up values, so no credentials and no network are needed. `variables { ... }` sets the inputs used by every `run` below.

Lines 12 to 34:

```hcl
run "the_role_trusts_one_repository_and_one_environment" {
  command = plan

  assert {
    condition     = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:owner/vulnerable-demo:environment:production"
    error_message = "the subject must name the repository and the environment exactly"
  }

  assert {
    condition     = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    error_message = "the audience must be sts.amazonaws.com"
  }

  assert {
    condition     = !can(jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringLike)
    error_message = "the trust policy must use StringEquals only, never a wildcard match"
  }

  assert {
    condition     = length(jsondecode(aws_iam_role.deploy.assume_role_policy).Statement) == 1
    error_message = "one statement only"
  }
}
```

First test: `command = plan` runs a plan (not an apply). Each `assert` block has a `condition` that must be true and an `error_message` shown if it is not. `jsondecode(text)` parses the policy text into a structure; `.Statement[0].Condition.StringEquals["...:sub"]` walks into it. The four assertions: the subject names the repository and the environment exactly; the audience is `sts.amazonaws.com`; there is no `StringLike` (`!can(...)` is true when reading that part fails, i.e. when it is absent); there is exactly one statement (`length(...) == 1`).

Lines 36 to 48:

```hcl
run "the_permissions_are_writes_under_releases_and_nothing_else" {
  command = plan

  assert {
    condition     = jsondecode(aws_iam_role_policy.deploy.policy).Statement[0].Resource == "arn:aws:s3:::example-release-bucket/releases/*"
    error_message = "writes are limited to the releases/ prefix of one bucket"
  }

  assert {
    condition     = length(flatten([for s in jsondecode(aws_iam_role_policy.deploy.policy).Statement : s.Action])) == 3
    error_message = "exactly PutObject, AbortMultipartUpload and ListBucket"
  }
}
```

Second test: the permissions policy's first statement has the resource `arn:aws:s3:::example-release-bucket/releases/*` and, across all statements, the number of actions is exactly three (`flatten` merges the nested lists into one list; the `for` expression builds a list of each statement's actions).

Lines 50 to 57:

```hcl
run "the_session_lasts_an_hour_by_default" {
  command = plan

  assert {
    condition     = aws_iam_role.deploy.max_session_duration == 3600
    error_message = "short-lived credentials"
  }
}
```

Third: `aws_iam_role.deploy.max_session_duration == 3600`.

Lines 59 to 70:

```hcl
run "the_identity_provider_can_be_left_to_an_existing_one" {
  command = plan

  variables {
    create_oidc_provider = false
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0
    error_message = "no second provider for the same URL"
  }
}
```

Fourth: with `create_oidc_provider = false` in a nested `variables` block, the provider resource has zero copies (`length(...) == 0`).

Lines 72 to 100:

```hcl
run "a_wildcard_in_the_repository_is_refused" {
  command = plan

  variables {
    github_repository = "owner/*"
  }

  expect_failures = [var.github_repository]
}

run "a_wildcard_in_the_environment_is_refused" {
  command = plan

  variables {
    environment = "prod*"
  }

  expect_failures = [var.environment]
}

run "a_bucket_arn_with_a_path_is_refused" {
  command = plan

  variables {
    bucket_arn = "arn:aws:s3:::example-release-bucket/*"
  }

  expect_failures = [var.bucket_arn]
}
```

Fifth to seventh: three **negative tests**. Each sets one bad input (`owner/*` for the repository, `prod*` for the environment, a bucket ARN ending in `/*`) and lists in `expect_failures` the variable whose validation must reject it. The run passes only if that validation fails.

<!-- /walk:infra/modules/github-oidc-role/tests/trust.tftest.hcl -->

<!-- walk:infra/environments/demo/demo.tfvars.example -->
### `infra/environments/demo/demo.tfvars.example`, line by line

Lines 1 to 6:

```hcl
# Copy to demo.tfvars (git-ignored), fill in your own values and run `terraform apply -var-file=demo.tfvars`.

aws_account_id       = "123456789012"                  # your 12-digit account
github_repository    = "your-account/vulnerable-demo"  # OWNER/NAME of the repository
bucket_name          = "your-unique-attack-and-harden-releases"
region               = "us-east-1"
create_oidc_provider = true # false if the account already has token.actions.githubusercontent.com
```

A template, copied to `demo.tfvars` (ignored by Git) and edited. Each line is `variable = value` with a trailing `#` comment. Placeholders: a 12-digit account id, the repository `OWNER/NAME`, a unique bucket name, the region, and `create_oidc_provider = true` (set to `false` if the account already has the GitHub provider).

<!-- /walk:infra/environments/demo/demo.tfvars.example -->

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
