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

locals {
  tags = {
    project   = "attack-and-harden"
    managedBy = "terraform"
  }
}

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
