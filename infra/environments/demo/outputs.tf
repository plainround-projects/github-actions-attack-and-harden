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
