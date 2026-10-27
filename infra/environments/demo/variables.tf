variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "The 12-digit account to deploy into."
  type        = string
}

variable "github_repository" {
  description = "OWNER/NAME of the GitHub repository whose production environment deploys."
  type        = string
}

variable "environment" {
  description = "The GitHub environment the deploy job runs in."
  type        = string
  default     = "production"
}

variable "bucket_name" {
  description = "Globally unique name of the release bucket."
  type        = string
}

variable "create_oidc_provider" {
  description = "Create the account's GitHub identity provider; false when the account already has one."
  type        = bool
  default     = true
}

variable "offline" {
  description = "Skip every call to AWS so `terraform plan` runs without credentials. Never true when applying."
  type        = bool
  default     = false
}
