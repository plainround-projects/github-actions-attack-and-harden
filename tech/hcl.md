# HCL (HashiCorp Configuration Language)

## What it is

HCL is the file format Terraform reads. It was designed to be easier for people to write than JSON and more structured than a list of settings. A file ending in `.tf` holds Terraform configuration; a file ending in `.tfvars` holds values for variables; `.tftest.hcl` holds tests; `.terraform.lock.hcl` is a generated lock file.

HCL has two main shapes.

**Arguments** assign a value to a name:

```hcl
region = "us-east-1"
```

**Blocks** are named containers, with a type, optional labels in quotes, and `{ }`:

```hcl
resource "aws_iam_role" "deploy" {
  name = "github-actions-deploy"
}
```

Here `resource` is the block type, `"aws_iam_role"` is the kind of resource, `"deploy"` is the name you give it, and the body holds arguments. The full address of that role elsewhere is `aws_iam_role.deploy`.

Value types: strings (`"text"`), numbers, booleans (`true`), lists (`["a", "b"]`), maps/objects (`{ key = "value" }`). Comments start with `#` or `//`, or sit between `/*` and `*/`.

## Why this repository uses it

Everything under `infra/` is written in it, and the tests are too. The language is also where the trust policy gets its precision: the policy is built from values (repository and environment names) that Terraform checks before building anything.

## Where it appears

| Path | What it is |
| --- | --- |
| `infra/**/*.tf` | Resources, variables, outputs, modules, versions. |
| `infra/environments/demo/offline.tfvars`, `demo.tfvars.example` | Variable values. |
| `infra/modules/github-oidc-role/tests/trust.tftest.hcl` | Tests. |
| `infra/**/.terraform.lock.hcl` | Generated lock files. Do not edit. |

## How it works underneath

### References and expressions

- `var.name` reads a variable; `local.name` a local value; `module.x.output_name` an output of a module; `aws_iam_role.deploy.arn` an attribute of a resource.
- Inside a string, `${ ... }` inserts an expression: `"repo:${var.github_repository}:environment:${var.environment}"`. (This looks like GitHub's `${{ }}` but is unrelated, and is evaluated by Terraform, never by a shell.)
- `condition ? a : b` chooses between two values.
- Functions: `jsonencode(value)` produces JSON text from a structure; `jsondecode(text)` does the reverse; `can(expr)` is true if `expr` has no error; `regex(pattern, text)` matches; `length(list)`; `flatten(list)`.
- `count = condition ? 1 : 0` makes a resource optional: zero copies means it is not created.
- A `for` expression builds a list: `[for s in list : s.Action]`.
- `locals { ... }` define named intermediate values.

### Order does not matter

HCL describes what should exist, not steps. Terraform finds dependencies from the references and orders the work. `depends_on = [ ... ]` adds an order that is not visible from references.

## Walkthrough of this repository's use

Building a policy with `jsonencode` (`github-oidc-role/main.tf`):

```hcl
assume_role_policy = jsonencode({
  Version = "2012-10-17"
  Statement = [{
    Effect    = "Allow"
    Principal = { Federated = local.provider_arn }
    Action    = "sts:AssumeRoleWithWebIdentity"
    Condition = {
      StringEquals = {
        "${local.host}:aud" = "sts.amazonaws.com"
        "${local.host}:sub" = local.subject
      }
    }
  }]
})
```

An object `{ ... }` with names, a list `[ { ... } ]` holding one statement, and `jsonencode` turning it all into the JSON text AWS expects. Keys that contain a colon must be quoted: `"${local.host}:aud"`, which becomes `token.actions.githubusercontent.com:aud`. Building JSON this way means a quote in a value can never break the structure.

Locals:

```hcl
locals {
  host    = "token.actions.githubusercontent.com"
  subject = "repo:${var.github_repository}:environment:${var.environment}"
  provider_arn = "arn:aws:iam::${var.aws_account_id}:oidc-provider/${local.host}"
}
```

The comment above `provider_arn` in the file explains it is built from the account id instead of read from the resource, so the value is known at plan time and the tests can inspect it.

Optional resource:

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0
  url            = "https://${local.host}"
  client_id_list = ["sts.amazonaws.com"]
  tags           = var.tags
}
```

An AWS account can have only one provider per URL, so `count` makes this resource present or absent. The role then says `depends_on = [aws_iam_openid_connect_provider.github]`, and the test counts `length(aws_iam_openid_connect_provider.github) == 0` when it is off.

Variable with a default and a validation (`variables.tf`): see `terraform.md`. A `bool` with `default = true`, a `map(string)` with `default = {}`, a `number` with `default = 3600`.

Output:

```hcl
output "role_arn" {
  description = "Set this as the repository variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}
```

A `.tfvars` file is just arguments:

```hcl
offline           = true
aws_account_id    = "123456789012"
github_repository = "owner/vulnerable-demo"
bucket_name       = "example-attack-and-harden-releases"
```

`terraform fmt` aligns the `=` signs in a block, which is why you see the columns lined up.

### More HCL seen in `release-bucket/main.tf`

```hcl
resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}
```

A block can contain **nested blocks** (`rule { ... }`) as well as arguments. `aws_s3_bucket.this.id` refers to the bucket created above; naming every resource in a module `this` is a common habit when a module has one of each kind. Using that reference makes Terraform create the bucket first.

```hcl
resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}
```

`filter {}` is an empty nested block: "apply to all objects". `depends_on` lists resources that must be created first although nothing here refers to them. In `demo/main.tf`, `provider "aws" { default_tags { tags = local.tags } }` shows a nested block inside a provider, and `module "release_bucket" { source = "..." }` shows a block whose arguments (`bucket_name = ...`) become the module's variables. In `versions.tf`, `terraform { required_providers { aws = { source = "hashicorp/aws", version = "~> 6.0" } } }` shows nested blocks and an object value together.

In the test file, `mock_provider "aws" {}` is a block with a label and an empty body; `variables { ... }` sets inputs for all runs; `run "name" { command = plan ... }` defines one test; `assert { condition = ... error_message = "..." }` is a check; `expect_failures = [var.github_repository]` is a list of things that must fail.

## Try it yourself

1. `terraform fmt -check -recursive infra` prints nothing and exits 0.
2. `terraform console` is an interactive prompt for expressions: type `jsonencode({a = 1})` and read `"{\"a\":1}"`; press Ctrl-D to leave. (Run it in a folder with no configuration, or give `-chdir`.)
3. `grep -n '\${' infra/modules/github-oidc-role/main.tf` lists every string interpolation.
4. `terraform -chdir=infra/environments/demo validate` prints `Success! The configuration is valid.` (after an `init -backend=false`).
5. Change `count = var.create_oidc_provider ? 1 : 0` to `? 2 : 0` and run `validate`; it still passes, but a plan would try to make two providers for the same URL. Undo the change.

## Mistakes people make

- Quoting everything: `count = "1"` is a string, not a number.
- Editing `.terraform.lock.hcl` by hand.
- Forgetting to quote an object key that contains a colon.
- Believing the order of blocks in the file matters.
- Putting secrets in `.tfvars` files that are committed (the repository's `.gitignore` excludes `demo.tfvars`).

## Check yourself

1. What are the two shapes in HCL? *(Arguments `name = value` and blocks `type "label" { ... }`.)*
2. What does `count = var.x ? 1 : 0` do? *(Makes the resource optional.)*
3. What does `jsonencode` buy us? *(Correct JSON from a structure, with no hand-built quoting.)*
4. What is `aws_iam_role.deploy.arn`? *(The `arn` attribute of the resource of type `aws_iam_role` named `deploy`.)*
5. Why are the `=` signs lined up? *(`terraform fmt` aligns them.)*

## Further reading

- HCL language documentation: https://developer.hashicorp.com/terraform/language
- Functions: https://developer.hashicorp.com/terraform/language/functions
- HCL syntax spec: https://github.com/hashicorp/hcl/blob/main/hclsyntax/spec.md
