# release-bucket

A private S3 bucket for release builds: all public access blocked, owner-enforced ownership (no ACLs), versioning on,
server-side encryption, and old versions expire after 30 days by default.

Inputs: `bucket_name`, `force_destroy` (default `false`), `noncurrent_version_days` (default `30`), `tags`.
Outputs: `bucket_arn`, `bucket_name`.

Cost: an empty bucket costs nothing; a few small builds cost cents per month.
