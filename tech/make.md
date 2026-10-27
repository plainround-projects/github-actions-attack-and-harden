# Make

## What it is

Make is a command-line tool that runs named recipes from a file called `Makefile`. A recipe is a **target**: a name, what it depends on (its **prerequisites**), and shell commands. Make can rebuild only what is out of date by comparing file times, and projects also use it as a short list of named commands (`make test`).

## Why this repository uses it

Every task has one memorable name: `make test`, `make lint`, `make infra-check`, `make run`. The same commands run on a laptop and in CI, so "it passed on my machine" and "it passed in CI" mean the same thing. `make help` lists every target with a one-line description.

## Where it appears

| Path | What it is |
| --- | --- |
| `Makefile` | All targets: `install`, `up`, `run`, `attack-scan`, `test`, `lint`, `format`, `infra-check`, `plan`, `check-trust`, `audit`, `check`, `down`, `clean`. |
| `.github/workflows/ci.yml` | The `infra` job runs `make infra-check`. |

## How it works underneath

Make reads the Makefile, picks the target you named, builds its prerequisites first, then runs its recipe. A target that names a file is rebuilt only if a prerequisite is newer. A name that is not a file belongs under `.PHONY`. Each recipe line starts with a **tab** and runs in its own shell; `@` hides the echo of a line, `-` ignores its failure. `$(NAME)` expands a variable; in a recipe a shell variable needs `$$name`.

## Walkthrough of this repository's use

### Variables at the top

```make
ACT_IMAGE := gha-projects-act-runner:ubuntu-24.04
TF_ENV := infra/environments/demo
export TF_PLUGIN_CACHE_DIR ?= $(HOME)/.terraform.d/plugin-cache
STAMP := node_modules/.installed
DEPS := $(if $(CI),,install)
```

`:=` assigns once. `?=` assigns only if the variable is not already set, so the caller can override it. `export` hands a variable to the programs the recipes start, here Terraform, which uses `TF_PLUGIN_CACHE_DIR` to share one copy of the large AWS provider between directories. `$(if $(CI),,install)` means: if the environment variable `CI` is set (GitHub sets it) the value is empty, otherwise it is `install`. So on a laptop `lint` first makes sure dependencies are installed, while in CI, where the workflow already ran `npm ci`, nothing extra happens.

### Targets, prerequisites, recipes

```make
$(STAMP): package-lock.json
	npm ci --ignore-scripts
	touch $@

install: $(STAMP) ## install the Node dependencies from the lock file
```

A **rule** is `target: prerequisites` followed by tab-indented **recipe** lines. Make runs a recipe only if the target is missing or older than a prerequisite. `$@` is the target's name, so `touch $@` updates the marker `node_modules/.installed`. This turns "install" into "install only when the lock file changed". `install` itself is a convenient name for that marker.

### Self-documenting help

```make
help: ## list the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed -E 's/:.*## /\t/' | sort
```

The text after `##` on each target line is its description. `grep` finds those lines, `sed` replaces everything between the colon and the text by a tab, `sort` orders them. A leading `@` stops Make from echoing the command itself.

### Phony targets

```make
.PHONY: help install up run attack-scan test lint format infra-check plan check-trust audit check down clean
```

These names are commands, not files. Without `.PHONY`, a file called `test` would make `make test` say "up to date".

### Ignoring a failure on purpose

```make
attack-scan: $(DEPS)
	-actionlint exploit/vulnerable/.github/workflows/*.yml
	-npx tsx pipeline/harden-lint-cli.ts exploit/vulnerable/.github/workflows
```

A leading `-` tells Make to carry on even if the line fails. Both linters are expected to exit 1 on the weak workflows; that is the demonstration.

### Calling other targets and working in other folders

```make
infra-check: $(DEPS)
	terraform fmt -check -recursive infra
	terraform -chdir=infra/modules/github-oidc-role init -backend=false -input=false
	terraform -chdir=infra/modules/github-oidc-role test
	...
	$(MAKE) --no-print-directory check-trust

check-trust: plan
	terraform -chdir=$(TF_ENV) show -json plan.bin > $(TF_ENV)/plan.json
	npx tsx pipeline/check-trust-cli.ts $(TF_ENV)/plan.json owner/vulnerable-demo production
```

`-chdir=DIR` is Terraform's way of running as if started in `DIR`. Each recipe line is a separate shell, so they stay independent. `check-trust: plan` says "run `plan` first". `$(MAKE)` is how a Makefile calls itself. `check: lint test infra-check` bundles three targets: "everything that needs no Docker and no cloud account".

### Cleaning up

```make
down: ## remove leftover act containers of this project's runner image
	-docker ps -aq --filter "ancestor=$(ACT_IMAGE)" | xargs docker rm -f

clean: down
	rm -rf node_modules dist build coverage $(TF_ENV)/plan.bin ...
```

`down` lists container ids (`-q`, all states `-a`) made from this project's image only and removes them. It filters by image so it cannot touch another project's containers.

### Every target, in one table

`make NAME` runs the target `NAME`. Targets marked "needs Docker" are the only ones that start containers.

| Target | Prerequisites | What its recipe runs | Why |
| --- | --- | --- | --- |
| `help` | none | the `grep`/`sed`/`sort` line shown above | list targets |
| `$(STAMP)` (`node_modules/.installed`) | `package-lock.json` | `npm ci --ignore-scripts`, then `touch` the marker | install only when the lock file changed |
| `install` | the marker | nothing (the prerequisite does the work) | a friendly name |
| `up` | `install` | `mkdir -p $(TF_PLUGIN_CACHE_DIR)` and `docker build -q -t $(ACT_IMAGE) ci/act-runner` (needs Docker) | install and build the image `act` uses |
| `run` | `$(DEPS)` | `scripts/lab.sh` (needs Docker) | the attacks and their fixes, checked |
| `attack-scan` | `$(DEPS)` | both linters on the lab workflows, failures ignored | show what the linters find |
| `test` | `$(DEPS)` | `npx vitest run --coverage` | the 90 tests with coverage |
| `lint` | `$(DEPS)` | `npx eslint .`, `npx prettier --check .`, `npx tsc -p tsconfig.json --noEmit`, `actionlint`, `npx tsx pipeline/harden-lint-cli.ts` | all static checks; the first failing line stops the target |
| `format` | `$(DEPS)` | `npx prettier --write .` | apply the formatting |
| `infra-check` | `$(DEPS)` | the Terraform commands listed in `terraform.md`, then `check-trust` | check the cloud definitions offline |
| `plan` | none | `terraform init -backend=false -input=false` then `terraform plan -var-file=offline.tfvars -input=false -out=plan.bin` in the demo folder | the offline plan |
| `check-trust` | `plan` | `terraform show -json plan.bin > plan.json`, then `npx tsx pipeline/check-trust-cli.ts plan.json owner/vulnerable-demo production` | eight sample logins against the planned policy |
| `audit` | `$(DEPS)` | `npm audit --audit-level=high` | known-flaw check on locked packages |
| `check` | `lint test infra-check` | nothing of its own | "everything that needs no Docker and no cloud account" |
| `down` | none | removes leftover containers of this project's image | clean up after `act` |
| `clean` | `down` | `rm -rf node_modules dist build coverage` and the plan and `.terraform` folders | remove generated files |

`npx NAME` runs a program installed in `node_modules/.bin`. A `>` after a command sends its output into a file; `$(TF_ENV)/plan.json` is the path `infra/environments/demo/plan.json`. `-chdir=DIR` is explained in the Terraform note.

<!-- walk:Makefile -->
### `Makefile`, line by line

Lines 1 to 9:

```make
# make help lists every target.   make up | run | test | lint | down

ACT_IMAGE := gha-projects-act-runner:ubuntu-24.04
TF_ENV := infra/environments/demo
export TF_PLUGIN_CACHE_DIR ?= $(HOME)/.terraform.d/plugin-cache
STAMP := node_modules/.installed
# In CI (the CI variable is set) the workflow has already run npm ci.

DEPS := $(if $(CI),,install)

.PHONY: help install up run attack-scan test lint format infra-check plan check-trust audit check down clean
```

A comment line, then the variables. `ACT_IMAGE` and `TF_ENV` are plain text values. `export TF_PLUGIN_CACHE_DIR ?= ...` hands a cache folder to Terraform (and only if not already set). `STAMP` is the marker file for the install. `DEPS` is empty in CI and `install` elsewhere (the comment above it explains: in CI the workflow has already run `npm ci`). `.PHONY` lists the target names that are commands.

Lines 11 to 22:

```make
help: ## list the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed -E 's/:.*## /\t/' | sort

$(STAMP): package-lock.json
	npm ci --ignore-scripts
	touch $@

install: $(STAMP) ## install the Node dependencies from the lock file

up: install ## install dependencies and build the act runner image (Docker needed for run)
	@mkdir -p $(TF_PLUGIN_CACHE_DIR)
	docker build -q -t $(ACT_IMAGE) ci/act-runner
```

`help` prints the targets (explained above). The `$(STAMP)` rule installs the locked packages when `package-lock.json` is newer than the marker. `install` is just a name for it. `up` depends on `install`, creates the Terraform plugin cache folder (`@` hides the command from the output) and builds the runner image (`-q` quiet, `-t` name, `ci/act-runner` the folder with the Dockerfile).

Lines 24 to 41:

```make
# The lesson's attacks on the vulnerable workflows and the fixes, with act, each checked (see scripts/lab.sh).

run: $(DEPS) ## run attacks 1 and 2 and their fixes locally with act; fails unless each behaves as the lesson says
	scripts/lab.sh

# Stretch 1: point two linters at the vulnerable lab files. They are expected to find problems (exit 1).

attack-scan: $(DEPS) ## lint the vulnerable lab workflows: actionlint and harden-lint both report findings
	-actionlint exploit/vulnerable/.github/workflows/*.yml
	-npx tsx pipeline/harden-lint-cli.ts exploit/vulnerable/.github/workflows

test: $(DEPS) ## unit, integration, end-to-end and pipeline tests with coverage
	npx vitest run --coverage

lint: $(DEPS) ## eslint (with the import rules), prettier, tsc, actionlint, harden-lint, pins
	npx eslint .
	npx prettier --check .
	npx tsc -p tsconfig.json --noEmit
	actionlint
	npx tsx pipeline/harden-lint-cli.ts
```

`run` runs the lab. `attack-scan` runs the two linters on the lab workflows; the leading `-` ignores their failing exit codes. `test` runs Vitest with coverage. `lint` runs, in order: ESLint over everything, Prettier in check mode, the TypeScript compiler without writing output, actionlint, and the repository's own workflow linter; if one fails, the rest are skipped.

Lines 43 to 56:

```make
format: $(DEPS) ## apply prettier
	npx prettier --write .

# Terraform checked without an AWS account: format, validate, offline tests of the trust policy, an offline plan, and

# the trust policy of that plan tried against eight tokens.

infra-check: $(DEPS) ## terraform fmt, validate, test, offline plan, then check-trust against the rendered policy
	terraform fmt -check -recursive infra
	terraform -chdir=infra/modules/github-oidc-role init -backend=false -input=false
	terraform -chdir=infra/modules/github-oidc-role test
	terraform -chdir=infra/modules/release-bucket init -backend=false -input=false
	terraform -chdir=infra/modules/release-bucket validate
	terraform -chdir=$(TF_ENV) init -backend=false -input=false
	terraform -chdir=$(TF_ENV) validate
	$(MAKE) --no-print-directory check-trust
```

`format` rewrites files to the Prettier style. `infra-check` is the Terraform sequence: format check; init, test of the role module; init and validate of the bucket module; init and validate of the demo; then `$(MAKE) --no-print-directory check-trust` calls the `check-trust` target of this same Makefile without the "entering directory" noise.

Lines 58 to 75:

```make
plan: ## offline plan of the demo environment (no credentials)
	terraform -chdir=$(TF_ENV) init -backend=false -input=false
	terraform -chdir=$(TF_ENV) plan -var-file=offline.tfvars -input=false -out=plan.bin

check-trust: plan ## try eight OIDC tokens against the planned trust policy
	terraform -chdir=$(TF_ENV) show -json plan.bin > $(TF_ENV)/plan.json
	npx tsx pipeline/check-trust-cli.ts $(TF_ENV)/plan.json owner/vulnerable-demo production

audit: $(DEPS) ## npm audit for known vulnerabilities (high and above fail)
	npm audit --audit-level=high

check: lint test infra-check ## everything that needs no Docker and no cloud account

down: ## remove leftover act containers of this project's runner image
	-docker ps -aq --filter "ancestor=$(ACT_IMAGE)" | xargs docker rm -f

clean: down
	rm -rf node_modules dist build coverage $(TF_ENV)/plan.bin $(TF_ENV)/plan.json $(TF_ENV)/.terraform infra/modules/*/.terraform
```

`plan`: the offline plan. `check-trust` depends on `plan`; it renders the plan as JSON into `plan.json` and runs the checker with the repository `owner/vulnerable-demo` and the environment `production`. `audit` asks npm about known flaws in locked packages (`--audit-level=high` ignores low and moderate ones). `check` has only prerequisites: the three targets that need no Docker and no cloud account. `down` removes leftover containers made from this project's image (`docker ps -aq --filter "ancestor=..."` prints their ids; `xargs docker rm -f` removes them). `clean` depends on `down` and deletes generated folders and files.

<!-- /walk:Makefile -->

## Try it yourself

1. `make help` prints each target with its description.
2. `make -n test` prints the commands `make test` would run without running them.
3. `make lint` runs ESLint, Prettier, `tsc`, actionlint and the workflow linter.
4. `make attack-scan` prints the lab findings and still ends successfully, because of the `-` prefixes.
5. Compare `make -n -B test` with `CI=true make -n -B test`: the first starts with `npm ci --ignore-scripts` (the dependency step), the second does not. (`-B` pretends everything is out of date.)

## Mistakes people make

- Spaces instead of a tab at the start of a recipe line ("missing separator").
- Forgetting `.PHONY`.
- `$id` instead of `$$id` for a shell variable in a recipe (Make eats single `$`).
- Expecting a `cd` on one recipe line to affect the next (each line is its own shell).
- Using GNU Make 4 features on macOS's Make 3.81.

## Check yourself

1. What does `?=` do? *(Sets a variable only if it is not already set.)*
2. Why is `DEPS` empty in CI? *(The workflow already ran `npm ci`.)*
3. What does `touch $@` do? *(Updates the marker file named by the target.)*
4. What does a leading `-` on a recipe line do? *(Ignores a failure of that line.)*
5. Why `.PHONY`? *(So the targets are treated as commands even if a file has the same name.)*

## Further reading

- GNU Make manual: https://www.gnu.org/software/make/manual/make.html
