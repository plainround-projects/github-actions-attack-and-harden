# Amazon S3

## What it is

Amazon S3 (Simple Storage Service) is Amazon's file storage service. You create a **bucket**, a named container, and put **objects** (files) in it. Each object is found by its **key**, which looks like a file path (`releases/3d3c42e.../app.js`) but is really just a name: S3 has no real folders. A key prefix such as `releases/` behaves like a folder when you list or filter.

Properties worth knowing:

- Bucket names are **globally unique** across all of AWS and use lowercase letters, digits, dots and hyphens (3 to 63 characters).
- Objects are private by default.
- **Versioning** keeps old copies when an object is overwritten or deleted.
- **Server-side encryption** encrypts objects at rest (`AES256` is S3's own managed key).
- You pay for storage and requests.

## Why this repository uses it

The deploy job needs somewhere to put the build. A bucket is the simplest possible target, and it makes the least-privilege story concrete: the role may write only under `releases/` in this one bucket.

## Where it appears

| Path | What it is |
| --- | --- |
| `infra/modules/release-bucket/` | The bucket and its protections. |
| `infra/modules/github-oidc-role/main.tf` | The role's permissions on that bucket. |
| `.github/workflows/deploy.yml` | `aws s3 sync dist "s3://${BUCKET}/releases/${GITHUB_SHA}/" --no-progress`. |
| `scripts/set-variables.sh` | Publishes the bucket name as the repository variable `DEPLOY_BUCKET`. |

## How it works underneath

An **ARN** names a bucket (`arn:aws:s3:::my-bucket`) or objects in it (`arn:aws:s3:::my-bucket/releases/*`). Different IAM actions apply to different forms: listing is checked against the bucket ARN, uploading against object ARNs.

`aws s3 sync SOURCE DEST` copies the files that are new or changed from a folder to a prefix. The AWS command line tool is `aws`, installed on GitHub's runners.

Buckets have several independent settings, each its own Terraform resource:

- **Public access block**: four switches that stop any public ACL or policy from making objects public.
- **Ownership controls**: `BucketOwnerEnforced` turns off the old per-object ACLs, so only IAM policies decide access.
- **Versioning**: keeps previous versions.
- **Encryption**: encrypt every object.
- **Lifecycle**: automatic clean-up rules.

## Walkthrough of this repository's use

```hcl
resource "aws_s3_bucket" "this" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy
  tags          = var.tags
}
```

The bucket. `force_destroy` (default `false`) lets `terraform destroy` delete a bucket that still holds objects; the demo environment sets it to `true` because it is throwaway.

```hcl
resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

All four switches on: no way to make this bucket public by accident.

```hcl
resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
```

Access is controlled by IAM only.

```hcl
resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration { status = "Enabled" }
}
```

Overwriting `releases/<sha>/app.js` keeps the old version.

```hcl
resource "aws_s3_bucket_server_side_encryption_configuration" "this" { ... sse_algorithm = "AES256" ... }
```

Encrypt at rest with S3-managed keys.

```hcl
rule {
  id     = "expire-old-versions"
  status = "Enabled"
  filter {}
  noncurrent_version_expiration { noncurrent_days = var.noncurrent_version_days }
  abort_incomplete_multipart_upload { days_after_initiation = 7 }
}
depends_on = [aws_s3_bucket_versioning.this]
```

Old (overwritten or deleted) versions are removed after 30 days (the default `noncurrent_version_days`), and uploads that began but never finished are cleaned up after 7 days. `filter {}` applies the rule to every object. `depends_on` makes Terraform enable versioning first.

The deploy step:

```bash
aws s3 sync dist "s3://${BUCKET}/releases/${GITHUB_SHA}/" --no-progress
```

Copies the compiled `dist/` folder to a path named after the commit, so each release is its own prefix. `BUCKET` arrives through `env:` from `vars.DEPLOY_BUCKET`. Quotes keep the shell from splitting the path. `--no-progress` keeps the log short. The role's policy allows exactly this: `PutObject` under `releases/*`, plus `ListBucket` for the `releases/` prefix, which `sync` uses to compare.

Name check in `variables.tf`: `bucket_name` must match `^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$` (3 to 63 characters, starting and ending with a letter or digit).

## Try it yourself

1. `grep -n "resource" infra/modules/release-bucket/main.tf` lists the six resources.
2. `make plan` ends with `Plan: 9 to add, 0 to change, 0 to destroy.` (six bucket resources, an OIDC provider, a role and a role policy).
3. `terraform -chdir=infra/modules/release-bucket validate` prints `Success! The configuration is valid.` (after `init -backend=false`).
4. `grep -n "aws s3" .github/workflows/deploy.yml` shows the one upload command.
5. With the AWS CLI installed, `aws s3 sync --help | head -5` shows what `sync` does. (Not needed to follow the repository; nothing here calls AWS.)

## Mistakes people make

- Public buckets by accident; the public access block prevents it.
- Treating keys as real folders and expecting rename or empty-directory behavior.
- `Resource = "*"` in the writer's policy.
- Skipping versioning and losing a release overwritten by mistake.
- Using `force_destroy = true` outside a throwaway environment.

## Check yourself

1. Is S3 a file system? *(No, a key-to-object store; slashes in keys are just characters.)*
2. What does the public access block do? *(Stops any setting from making the bucket public.)*
3. What does versioning keep? *(Old copies of overwritten or deleted objects.)*
4. Why is each release in `releases/<commit>/`? *(Every deploy gets its own prefix, and the role can be limited to `releases/`.)*
5. Why is `force_destroy` true only in the demo? *(It lets a bucket with files be deleted; unsafe for real data.)*

## Further reading

- S3 user guide: https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html
- Blocking public access: https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
- `aws s3 sync`: https://docs.aws.amazon.com/cli/latest/reference/s3/sync.html
- Terraform `aws_s3_bucket`: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket
