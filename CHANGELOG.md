# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-27

### Added

- The three vulnerable workflows of the lesson as lab files (`exploit/vulnerable`), the attack events, and a checkout stand-in so `make run` can reproduce attacks 1 and 2 and their fixes with `act`, each checked.
- The hardened workflows: `greet.yml` (environment variable, `permissions: {}`), `pr-build.yml` (`pull_request`, read-only, no secrets), `pr-report.yml` (`workflow_run`, validated artifact), `label.yml` (`pull_request_target`, no checkout, two scopes), `deploy.yml` (OIDC, `production` environment) and `ci.yml`.
- A small layered TypeScript application (domain, application, infrastructure, interfaces) with strict compiler options, ESLint import-boundary rules and unit, stream and process tests.
- `pipeline/`: `harden-lint` (eight rules, the review checklist as a linter), the validated build-result reader and idempotent comment writer, and a model of the AWS trust policy.
- Terraform: a `github-oidc-role` module (trust policy scoped to one repository and one environment, `StringEquals` only, least-privilege S3 permissions) with `terraform test` using a mocked provider, a `release-bucket` module, and an offline-plannable demo environment.
- `docs/review-checklist.md` (with a test that keeps its line references true), `docs/runbook.md` for the real GitHub steps, three decision records, and the `gh` scripts for repository settings and variables (with a `DRY_RUN` mode).
- Every action pinned to a full commit SHA; dependabot for actions, npm and Terraform.
