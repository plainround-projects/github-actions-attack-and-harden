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

variable "aws_account_id" {
  description = "The 12-digit account that owns the role and the identity provider."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be 12 digits."
  }
}

variable "role_name" {
  description = "Name of the IAM role the deploy job assumes."
  type        = string
  default     = "github-actions-deploy"
}

variable "bucket_arn" {
  description = "ARN of the bucket the deploy job may write to, under the releases/ prefix only."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_arn))
    error_message = "bucket_arn must be the ARN of one bucket, with no object path or wildcard."
  }
}

variable "create_oidc_provider" {
  description = "Create the account's GitHub identity provider. Set false when the account already has one (only one per URL is allowed)."
  type        = bool
  default     = true
}

variable "max_session_seconds" {
  description = "How long the temporary credentials last. The default is the AWS minimum, one hour."
  type        = number
  default     = 3600
}

variable "tags" {
  description = "Tags for the resources that support them."
  type        = map(string)
  default     = {}
}
