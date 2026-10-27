# actions/labeler and `labeler.yml`

## What it is

`actions/labeler` is a ready-made GitHub Action, written by GitHub, that adds **labels** to pull requests based on which files they change. A label is a small coloured tag on a pull request or issue (`docs`, `infra`). Labels help people filter, and other automation can react to them.

The rules live in a file, `.github/labeler.yml`: for each label, a list of file patterns. If a pull request changes any matching file, the label is added.

It is a good teaching example because of a design problem: to label a pull request from a **fork**, the workflow needs write access, which `pull_request` does not give to fork code. The usual answer is `pull_request_target`, which is dangerous when mixed with a checkout of the pull request. The labeler solves this safely: it never needs the pull request's files, only their **names**, which it reads through the GitHub API.

## Why this repository uses it

It is the hardened form of lab attack 3 (the `label.yml` job that carried a read-write token it did not need) and the demonstration that `pull_request_target` can be used safely when no checkout happens and the token has exactly the right two scopes.

## Where it appears

| Path | What it is |
| --- | --- |
| `.github/workflows/label.yml` | Runs the action with `pull_request_target`. |
| `.github/labeler.yml` | The label rules. |
| `exploit/vulnerable/.github/workflows/label.yml` | The weak version (no `permissions` block). |
| `pipeline/harden-lint.ts` | The `missing-permissions` rule flags the weak version. |

## How it works underneath

1. The workflow fires on `pull_request_target`. GitHub uses the workflow file from the **base** branch (the real repository), so a fork cannot edit the workflow to misuse the token.
2. The action reads `.github/labeler.yml` from the base branch through the API. Because the file is read from the base, a pull request cannot change its own labeling rules.
3. It asks the API for the list of changed file names in the pull request.
4. It matches those names against the `changed-files` patterns using glob matching.
5. It adds the labels that matched. With `sync-labels: true`, it also **removes** labels it manages that no longer match.

No code from the pull request is downloaded or run at any point.

### Glob patterns

`*` matches within one folder level; `**` matches across levels. `.github/workflows/**` matches every file anywhere below `.github/workflows/`. `**/*.md` matches any Markdown file in any folder.

## Walkthrough of this repository's use

```yaml
workflows:
  - changed-files:
      - any-glob-to-any-file: [".github/workflows/**", ".github/actions/**"]
infra:
  - changed-files:
      - any-glob-to-any-file: ["infra/**"]
app:
  - changed-files:
      - any-glob-to-any-file: ["src/**", "pipeline/**", "tests/**"]
docs:
  - changed-files:
      - any-glob-to-any-file: ["docs/**", "**/*.md"]
```

Four labels: `workflows`, `infra`, `app`, `docs`. Each has one condition type, `changed-files`, and `any-glob-to-any-file` means "label if *any* changed file matches *any* of these patterns".

```yaml
on:
  pull_request_target:
    types: [opened, synchronize, reopened]

permissions: {}

jobs:
  label:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read # the labeler reads .github/labeler.yml from the base branch through the API
      pull-requests: write # and adds the labels
    steps:
      - uses: actions/labeler@bf12e9b00b37c5c0ca2b87b79b2daf7891dbda13 # v7.0.0
        with:
          sync-labels: true
```

`types` limits the trigger to a new pull request (`opened`), new commits pushed to it (`synchronize`) and a closed one reopened (`reopened`). Both workflow and job set `permissions`: nothing at the top, and the job gets two scopes, `contents: read` (to read the rules file) and `pull-requests: write` (to add labels). There is no `actions/checkout` step. The action is pinned to a full commit SHA. `sync-labels: true` removes labels that no longer apply, for example after the last docs file is dropped from the pull request.

The lint rule `privileged-checkout` would raise an error if a checkout aimed at the pull request's head were added to this workflow.

## Try it yourself

1. `cat .github/labeler.yml` shows the four rules.
2. `npx tsx pipeline/harden-lint-cli.ts .github/workflows/label.yml` prints `harden-lint: 0 error(s), 0 warning(s)`.
3. `npx tsx pipeline/harden-lint-cli.ts exploit/vulnerable/.github/workflows/label.yml` prints `[missing-permissions]` and exits 1.
4. `grep -c checkout .github/workflows/label.yml` prints `0`.
5. Which labels would a pull request that changes only `docs/runbook.md` get? Answer: `docs`. One that changes `src/main.ts` and `README.md` gets `app` and `docs`.

## Mistakes people make

- Adding `actions/checkout` with the pull request's head to a `pull_request_target` workflow "to make the labeler work". It does not need it.
- Leaving out `permissions` and relying on the default token.
- Using `pull_request` and wondering why forks' pull requests cannot be labeled (the token is read-only there).
- Forgetting `sync-labels` and ending up with stale labels.

## Check yourself

1. Why is `pull_request_target` used here? *(Labeling a fork's pull request needs write access, which `pull_request` withholds.)*
2. Why is it safe here? *(No checkout; the rules file is read from the base branch; the token has two scopes.)*
3. What does the labeler look at? *(The names of the changed files, from the API.)*
4. What does `any-glob-to-any-file` mean? *(Label if any changed file matches any pattern.)*
5. What does `sync-labels: true` do? *(Removes labels that no longer match.)*

## Further reading

- actions/labeler: https://github.com/actions/labeler
- Security notes on `pull_request_target`: https://docs.github.com/en/actions/reference/security/secure-use
- GitHub, managing labels: https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels
