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
#
# How the fork is simulated: the fork's pull request is a copy of the repository in build/lab/ whose `build` script was
# replaced by exploit/fork/apply-fork-change.mjs, and act is pointed at that copy (the hardened workflow's checkout is
# skipped by act, which copies the working directory instead; the vulnerable workflow's checkout sets `ref:`, so a
# stand-in step replaces it and the copy is bound as the workspace). The workflows under test are unchanged.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
logs="$root/build/lab"
rm -rf "$logs"
mkdir -p "$logs"
# The lesson's fake secret. It is not a credential; it exists so the vulnerable job has something in scope.
fake_secret="DEPLOY_TOKEN=demo-not-a-real-secret"
# act's artifact service cannot be reached from a runner container when Docker runs in a VM, so the pinned
# upload-artifact action of the hardened workflow is replaced by a stand-in that lists the files (exploit/stubs).
pinned_upload="$(grep -o 'actions/upload-artifact@[0-9a-f]\{40\}' .github/workflows/pr-build.yml | head -1)"
upload_stub="$root/exploit/stubs/upload-artifact"
# The vulnerable workflow's checkout sets `ref:`, which act does not skip; the stand-in replaces it (exploit/stubs).
checkout_stub="$root/exploit/stubs/fork-checkout"
act_flags=(--concurrent-jobs 1)

# run LOG ACT_ARGS...: run act, keep its output in LOG, show it only if act itself fails.
run() {
  local log="$1"
  shift
  if ! act "${act_flags[@]}" "$@" >"$log" 2>&1; then
    # A busy Docker daemon can time out while act removes the job's volumes, after the job itself succeeded.
    if grep -q "Job succeeded" "$log" && ! grep -q "Job failed" "$log"; then
      echo "   (act reported a Docker cleanup error after the job succeeded; see $log)"
      return 0
    fi
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
mkdir -p "$logs/fork-vulnerable"
cp -R exploit/vulnerable/. "$logs/fork-vulnerable/"
node exploit/fork/apply-fork-change.mjs "$logs/fork-vulnerable/package.json"
run "$logs/attack2.log" pull_request_target -b -C "$logs/fork-vulnerable" -W .github/workflows/pr-build.yml \
  -e "$root/exploit/events/pull-request-from-fork.json" --local-repository "actions/checkout@v4=$checkout_stub" -s "$fake_secret"
grep -E "\| FORK CODE RAN" "$logs/attack2.log" | sed 's/^/   /'
expect "$logs/attack2.log" '\| FORK CODE RAN: event=pull_request_target deploy-token-in-environment=true$' \
  "the fork's build script ran with DEPLOY_TOKEN in its environment"

echo "== fix 2: the same fork code under pull_request, no secret (hardened pr-build.yml)"
mkdir -p "$logs/fork-hardened"
git ls-files -z | xargs -0 -I{} rsync -aR "{}" "$logs/fork-hardened/"
node exploit/fork/apply-fork-change.mjs "$logs/fork-hardened/package.json"
run "$logs/fix2.log" pull_request -C "$logs/fork-hardened" -W .github/workflows/pr-build.yml \
  -e "$root/exploit/events/pull-request-from-fork.json" --local-repository "$pinned_upload=$upload_stub"
grep -E "\| (FORK CODE RAN|artifact build-result)" "$logs/fix2.log" | sed 's/^/   /'
expect "$logs/fix2.log" '\| FORK CODE RAN: event=pull_request deploy-token-in-environment=false$' \
  "the fork's code still got built, with no secret anywhere in its environment"
expect "$logs/fix2.log" '\| artifact build-result: result.json' "the result file was recorded for pr-report"

echo "lab: every attack worked on the vulnerable workflow and every fix held"
