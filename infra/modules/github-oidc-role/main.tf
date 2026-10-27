locals {
  host    = "token.actions.githubusercontent.com"
  subject = "repo:${var.github_repository}:environment:${var.environment}"

  # Built from the account id rather than read from the resource, so the trust policy is known at plan time
  # and can be tested without credentials.
  provider_arn = "arn:aws:iam::${var.aws_account_id}:oidc-provider/${local.host}"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url            = "https://${local.host}"
  client_id_list = ["sts.amazonaws.com"]
  tags           = var.tags
}

# The trust policy: only a token issued by GitHub, for this audience, whose subject names this repository and this
# environment. A job from another branch, another repository or a fork presents a different subject and is refused.
resource "aws_iam_role" "deploy" {
  name                 = var.role_name
  description          = "Assumed by the ${var.environment} deploy job of ${var.github_repository} through GitHub OIDC."
  max_session_duration = var.max_session_seconds
  tags                 = var.tags

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

  depends_on = [aws_iam_openid_connect_provider.github]
}

# Least privilege: write objects under releases/ in one bucket, list that prefix, nothing else.
resource "aws_iam_role_policy" "deploy" {
  name = "release-upload"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
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
  })
}
