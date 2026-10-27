#!/usr/bin/env bash
# Apply on GitHub the settings the hardened workflows assume, with the gh CLI.
#
#   usage:  scripts/github-settings.sh OWNER/REPO REVIEWER_LOGIN
#           DRY_RUN=1 scripts/github-settings.sh OWNER/REPO REVIEWER_LOGIN    print the commands, change nothing
#
# Needs: gh signed in with admin rights on the repository. Nothing here runs from CI or from `make`; run it once, by
# hand, when the repository exists. It changes repository settings, so read it first.
set -euo pipefail

repo="${1:?usage: scripts/github-settings.sh OWNER/REPO REVIEWER_LOGIN}"
reviewer="${2:?usage: scripts/github-settings.sh OWNER/REPO REVIEWER_LOGIN}"

if [[ ! "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "github-settings: '$repo' is not OWNER/REPO" >&2
  exit 2
fi

gh_api() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf 'gh api'
    printf ' %q' "$@"
    printf '\n'
  else
    gh api "$@"
  fi
}

echo "1. The default token is read-only, and Actions cannot approve pull requests (lab attack 3)"
gh_api -X PUT "repos/$repo/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false

echo "2. Only actions pinned to a full commit SHA may run"
gh_api -X PUT "repos/$repo/actions/permissions" \
  -F enabled=true -f allowed_actions=all -F sha_pinning_required=true

echo "3. Every pull request from an outside contributor waits for approval before its workflows run"
gh_api -X PUT "repos/$repo/actions/permissions/fork-pr-contributor-approval" \
  -f approval_policy=all_external_contributors

echo "4. The production environment: required reviewer, deployable from main only"
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  reviewer_id="<id of $reviewer>"
else
  reviewer_id="$(gh api "users/$reviewer" --jq .id)"
fi
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "gh api -X PUT repos/$repo/environments/production --input - <<< '{reviewers: [User $reviewer_id], custom branch policies}'"
else
  gh api -X PUT "repos/$repo/environments/production" --input - <<JSON
{
  "wait_timer": 0,
  "prevent_self_review": false,
  "reviewers": [{ "type": "User", "id": $reviewer_id }],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON
fi
gh_api -X POST "repos/$repo/environments/production/deployment-branch-policies" -f name=main -f type=branch

echo "5. The stored cloud key is deleted (OIDC replaces it)"
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "gh secret delete DEPLOY_TOKEN --repo $repo"
else
  gh secret delete DEPLOY_TOKEN --repo "$repo" || echo "   (no DEPLOY_TOKEN secret to delete)"
fi

echo "done. Next: scripts/set-variables.sh $repo to publish the role ARN, region and bucket as repository variables."
