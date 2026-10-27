output "role_arn" {
  description = "Set this as the repository variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}

output "subject" {
  description = "The only OIDC subject the role trusts."
  value       = local.subject
}
