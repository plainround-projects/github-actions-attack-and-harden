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
