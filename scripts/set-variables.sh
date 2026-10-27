#!/usr/bin/env bash
# Publish the Terraform outputs of the demo environment as repository variables, for deploy.yml.
# They are variables, not secrets: a role ARN and a bucket name let nobody do anything without a token the trust policy
# accepts.
#
#   usage:  scripts/set-variables.sh OWNER/REPO
#           DRY_RUN=1 scripts/set-variables.sh OWNER/REPO    print the commands, change nothing
set -euo pipefail

repo="${1:?usage: scripts/set-variables.sh OWNER/REPO}"
env_dir="$(cd "$(dirname "$0")/.." && pwd)/infra/environments/demo"

set_variable() {
  local name="$1" output="$2" value
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "gh variable set $name --repo $repo --body <terraform output $output>"
  else
    value="$(terraform -chdir="$env_dir" output -raw "$output")"
    gh variable set "$name" --repo "$repo" --body "$value"
  fi
}

set_variable AWS_DEPLOY_ROLE_ARN deploy_role_arn
set_variable AWS_REGION region
set_variable DEPLOY_BUCKET deploy_bucket
