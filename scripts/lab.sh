#!/usr/bin/env bash
# The lesson's attacks and fixes, run locally with act, and checked: it exits non-zero unless every step shows what the
# lesson says it should.
#
#   attack 1  the vulnerable greet.yml runs the command hidden in an issue title
#   fix 1     the hardened greet.yml prints the same title as one line of text
#   attack 2  the vulnerable pr-build.yml (pull_request_target) runs the fork's build script with the secret in scope
#   fix 2     the hardened pr-build.yml (pull_request) runs the same fork code with no secret in scope
#
# Attacks 3 and 5 need GitHub (the repository's token default, an OIDC token and a cloud account); see README.md.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
logs="$root/build/lab"
mkdir -p "$logs"
checkout_stub="$root/exploit/stubs/fork-checkout"
# The lesson's fake secret. It is not a credential; it exists so the vulnerable job has something in scope.
fake_secret="DEPLOY_TOKEN=demo-not-a-real-secret"
pinned_checkout="$(grep -o 'actions/checkout@[0-9a-f]\{40\}' .github/workflows/pr-build.yml | head -1)"

# run LOG ACT_ARGS...: run act, keep its output in LOG, show it only if act itself fails.
run() {
  local log="$1"
  shift
  if ! act "$@" >"$log" 2>&1; then
    cat "$log"
    exit 1
  fi
}

# expect LOG REGEX MESSAGE: succeed when LOG has a line matching REGEX (act prefixes step output with "| ").
expect() {
  if grep -Eq "$2" "$1"; then
    printf 'ok   %s\n' "$3"
  else
    printf 'FAIL expected: %s\n' "$3" >&2
    exit 1
  fi
}

# expect_none LOG REGEX MESSAGE: succeed when no line matches.
expect_none() {
  if grep -Eq "$2" "$1"; then
    printf 'FAIL expected: %s\n' "$3" >&2
    exit 1
  else
    printf 'ok   %s\n' "$3"
  fi
}

echo "== attack 1: script injection through an issue title (vulnerable greet.yml)"
run "$logs/attack1.log" issues -C exploit/vulnerable -W .github/workflows/greet.yml -e "$root/exploit/events/issue-injection.json"
grep -E "\| (New issue|INJECTED)" "$logs/attack1.log" | sed 's/^/   /'
expect "$logs/attack1.log" '\| INJECTED-COMMAND-RAN$' "the injected command ran as a line of its own"

echo "== fix 1: the same title through an environment variable (hardened greet.yml)"
run "$logs/fix1.log" issues -W .github/workflows/greet.yml -e "$root/exploit/events/issue-injection.json"
grep -E "\| New issue" "$logs/fix1.log" | sed 's/^/   /'
expect_none "$logs/fix1.log" '\| INJECTED-COMMAND-RAN$' "the title printed as text and no command ran"

echo "== attack 2: a fork's code under pull_request_target with the secret in scope (vulnerable pr-build.yml)"
run "$logs/attack2.log" pull_request_target -C exploit/vulnerable -W .github/workflows/pr-build.yml \
  -e "$root/exploit/events/pull-request-from-fork.json" --local-repository "actions/checkout@v4=$checkout_stub" -s "$fake_secret"
grep -E "FORK CODE RAN" "$logs/attack2.log" | sed 's/^/   /'
expect "$logs/attack2.log" 'FORK CODE RAN: event=pull_request_target deploy-token-in-environment=true' \
  "the fork's build script ran with DEPLOY_TOKEN in its environment"

echo "== fix 2: the same fork code under pull_request, no secret (hardened pr-build.yml)"
run "$logs/fix2.log" pull_request -W .github/workflows/pr-build.yml -e "$root/exploit/events/pull-request-from-fork.json" \
  --local-repository "$pinned_checkout=$checkout_stub" --artifact-server-path "$logs/artifacts"
grep -E "FORK CODE RAN" "$logs/fix2.log" | sed 's/^/   /'
expect "$logs/fix2.log" 'FORK CODE RAN: event=pull_request deploy-token-in-environment=false' \
  "the fork's code still got built, with no secret anywhere in its environment"

echo "lab: every attack worked on the vulnerable workflow and every fix held"
