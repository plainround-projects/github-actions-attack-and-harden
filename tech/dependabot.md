# Dependabot

## What it is

Dependabot is a GitHub service that opens pull requests to update your dependencies when new versions come out. You configure it with a YAML file. It can watch GitHub Actions versions, npm packages, Terraform providers and many other kinds.

## Why this repository uses it

Pinning makes updates something you must do on purpose: every action is a 40-character SHA and every npm package an exact version. Dependabot proposes those updates as pull requests so they are reviewed, not forgotten. For the actions, it reads the `# v7.0.1` comment next to a SHA, finds the newer release and changes both. Three ecosystems are watched.

## Where it appears

| Path | What it does |
| --- | --- |
| `.github/dependabot.yml` | `github-actions` (root), `npm` (root), `terraform` (`/infra/environments/demo`), all weekly. |

## How it works underneath

On the schedule, Dependabot reads your files, looks up newer versions, and for a pinned action reads the `# v7.0.1` comment to learn which version the SHA stands for. It opens a pull request that changes both the SHA and the comment. Pull requests from Dependabot run your normal CI.

## Walkthrough of this repository's use

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      actions:
        patterns: ["*"]
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: terraform
    directory: /infra/environments/demo
    schedule:
      interval: weekly
```

`version: 2` is the file format. Each list item is one thing to watch. `package-ecosystem` names the kind of dependency; `directory` says where its files live (for `github-actions`, `/` means the `.github/workflows` folder); `schedule.interval: weekly` checks once a week. `groups` with `patterns: ["*"]` merges all action updates into one pull request named `actions`, instead of one per action (`"*"` is quoted because a bare `*` is special in YAML).

Two honest notes about coverage. The `terraform` entry watches `/infra/environments/demo`, whose `.terraform.lock.hcl` pins the AWS provider; the two module folders have their own lock files and are not listed, so a provider bump there would be a manual change. And the pins in `exploit/vulnerable/` are intentionally old and are not watched (the folder is not a place Dependabot looks, since its workflows are under `exploit/`, not `.github/`).

Pull requests from Dependabot go through the same `ci.yml` as any other, and `pr-build.yml` runs them with the unprivileged trigger.

## Try it yourself

1. `node -e "console.log(require('yaml').parse(require('fs').readFileSync('.github/dependabot.yml','utf8')).updates.map(u=>u['package-ecosystem']+' '+u.directory))"` prints `[ 'github-actions /', 'npm /', 'terraform /infra/environments/demo' ]`.
2. `grep -n "uses:" .github/workflows/ci.yml | head -3` shows a pinned SHA followed by a `# v...` comment, which is what Dependabot rewrites.
3. `npm outdated` lists packages with newer versions, the same information the bot uses (needs network).
4. Dependabot does not run locally; its first pull request appears after the first scheduled run on GitHub.

## Mistakes people make

- Pinning to SHAs without the version comment, so the bot cannot tell what to bump to.
- Merging every bot pull request without reading what changed in a dependency or action.
- Watching the root only when other folders hold their own lock files.
- Letting the bot open one pull request per dependency; `groups` helps.

## Check yourself

1. What does `package-ecosystem` choose? *(The kind of dependency to watch.)*
2. How does it know the version of a pinned action? *(From the `# vX.Y.Z` comment next to the SHA.)*
3. What does `groups` do? *(Combines several updates into one pull request.)*
4. Does it run on your laptop? *(No, it is a GitHub service.)*
5. Which folders hold Terraform lock files that it does not watch? *(The two module folders under `infra/modules/`.)*

## Further reading

- Dependabot options reference: https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference
