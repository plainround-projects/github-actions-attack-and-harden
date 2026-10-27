# Offline tests of the trust policy: `terraform test` with a mocked AWS provider, no credentials.

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

run "the_session_lasts_an_hour_by_default" {
  command = plan

  assert {
    condition     = aws_iam_role.deploy.max_session_duration == 3600
    error_message = "short-lived credentials"
  }
}

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
