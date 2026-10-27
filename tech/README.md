# Technology notes for github-actions-attack-and-harden

This folder teaches every technology the repository uses, from zero, through the repository's own files. Each note says what the technology is, why this repository uses it, where it appears, how it works underneath, and then walks through the repository's own lines, flag by flag. You need no earlier knowledge.

## The files and the order to read them

Read from the top: the idea of the project first, then the file formats and the language, then the checks and tests, then the cloud pieces, then the scripts and the tools that run it locally, then the tools around the code.

| # | Note | Role in this repository |
| ---: | --- | --- |
| 1 | [GitHub Actions: triggers, tokens, environments and the attacks on them](github-actions.md) | the service and the whole lesson: events, expressions, `pull_request_target`, token scopes, environments |
| 2 | [YAML](yaml.md) | the file format of every workflow, with its traps |
| 3 | [JSON](json.md) | event payloads, `package.json`, the result file and Terraform plans |
| 4 | [TypeScript](typescript.md) | the language of the greeter and of the CI tools, with strict settings |
| 5 | [Node.js](node.md) | runs everything: exit codes, environment variables, modules |
| 6 | [npm, package.json and the lock file](npm.md) | exact versions, checksums, `npm ci --ignore-scripts` |
| 7 | [tsx](tsx.md) | runs the CI tools without a build step |
| 8 | [The yaml package](yaml-library.md) | lets the workflow linter read workflows and report line numbers |
| 9 | [Vitest](vitest.md) | runs the 90 tests and enforces the coverage thresholds |
| 10 | [ESLint](eslint.md) | lints the code and enforces the layer rules as import bans |
| 11 | [Prettier](prettier.md) | formats the code; CI only checks |
| 12 | [The GitHub REST API](github-rest-api.md) | how `pr-report` posts its comment, with timeout and retries |
| 13 | [actions/labeler](labeler.md) | labels pull requests safely under `pull_request_target` |
| 14 | [Terraform](terraform.md) | describes the cloud pieces and tests them offline |
| 15 | [HCL](hcl.md) | the language Terraform reads |
| 16 | [AWS IAM](aws-iam.md) | roles, trust policy and permissions policy |
| 17 | [OpenID Connect](oidc.md) | the short-lived login that replaces a stored cloud key |
| 18 | [Amazon S3](aws-s3.md) | the release bucket and the narrow upload permission |
| 19 | [Bash](bash.md) | the lab, settings and install scripts |
| 20 | [Make](make.md) | `make test`, `make lint`, `make infra-check`, `make run` |
| 21 | [jq](jq.md) | builds `result.json` safely |
| 22 | [actionlint](actionlint.md) | checks workflow files before GitHub sees them |
| 23 | [ShellCheck](shellcheck.md) | checks shell code (through actionlint and by hand) |
| 24 | [Docker](docker.md) | the image `act` uses as `ubuntu-latest` |
| 25 | [act](act.md) | runs the attacks and the fixes on your machine |
| 26 | [Dependabot](dependabot.md) | proposes updates to pinned actions, packages and the provider |
| 27 | [GitHub CLI](gh-cli.md) | applies repository settings and variables |
| 28 | [Git and .gitignore](git.md) | why a SHA beats a tag; what is kept out of the repository |
| 29 | [EditorConfig](editorconfig.md) | the same indentation and line endings in every editor |
| 30 | [Markdown and Mermaid](markdown.md) | the documents, one of which is tested |

## If you have ten minutes

Read these three, in this order:

1. [GitHub Actions](github-actions.md): the three attacks and what each fix changes.
2. [OpenID Connect](oidc.md): how a deploy job logs in with no stored key.
3. [Git and .gitignore](git.md): why every action is pinned to a SHA and not a tag.
