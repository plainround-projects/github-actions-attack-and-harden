# make help lists every target.   make up | run | test | lint | down
ACT_IMAGE := plainround-act-runner:ubuntu-24.04
TF_ENV := infra/environments/demo
export TF_PLUGIN_CACHE_DIR ?= $(HOME)/.terraform.d/plugin-cache
STAMP := node_modules/.installed

.PHONY: help install up run attack-scan test lint format infra-check plan check-trust audit check down clean

help: ## list the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed -E 's/:.*## /\t/' | sort

$(STAMP): package-lock.json
	npm ci --ignore-scripts
	touch $@

install: $(STAMP) ## install the Node dependencies from the lock file

up: install ## install dependencies and build the act runner image (Docker needed for run)
	@mkdir -p $(TF_PLUGIN_CACHE_DIR)
	docker build -q -t $(ACT_IMAGE) ci/act-runner

# The lesson's attacks on the vulnerable workflows and the fixes, with act, each checked (see scripts/lab.sh).
run: install ## run attacks 1 and 2 and their fixes locally with act; fails unless each behaves as the lesson says
	scripts/lab.sh

# Stretch 1: point two linters at the vulnerable lab files. They are expected to find problems (exit 1).
attack-scan: install ## lint the vulnerable lab workflows: actionlint and harden-lint both report findings
	-actionlint exploit/vulnerable/.github/workflows/*.yml
	-npx tsx pipeline/harden-lint-cli.ts exploit/vulnerable/.github/workflows

test: install ## unit, integration, end-to-end and pipeline tests with coverage
	npx vitest run --coverage

lint: install ## eslint (with the import rules), prettier, tsc, actionlint, harden-lint, pins
	npx eslint .
	npx prettier --check .
	npx tsc -p tsconfig.json --noEmit
	actionlint
	npx tsx pipeline/harden-lint-cli.ts

format: install ## apply prettier
	npx prettier --write .

# Terraform checked without an AWS account: format, validate, offline tests of the trust policy, an offline plan, and
# the trust policy of that plan tried against eight tokens.
infra-check: install ## terraform fmt, validate, test, offline plan, then check-trust against the rendered policy
	terraform fmt -check -recursive infra
	terraform -chdir=infra/modules/github-oidc-role init -backend=false -input=false
	terraform -chdir=infra/modules/github-oidc-role test
	terraform -chdir=infra/modules/release-bucket init -backend=false -input=false
	terraform -chdir=infra/modules/release-bucket validate
	terraform -chdir=$(TF_ENV) init -backend=false -input=false
	terraform -chdir=$(TF_ENV) validate
	$(MAKE) --no-print-directory check-trust

plan: ## offline plan of the demo environment (no credentials)
	terraform -chdir=$(TF_ENV) init -backend=false -input=false
	terraform -chdir=$(TF_ENV) plan -var-file=offline.tfvars -input=false -out=plan.bin

check-trust: plan ## try eight OIDC tokens against the planned trust policy
	terraform -chdir=$(TF_ENV) show -json plan.bin > $(TF_ENV)/plan.json
	npx tsx pipeline/check-trust-cli.ts $(TF_ENV)/plan.json owner/vulnerable-demo production

audit: install ## npm audit for known vulnerabilities (high and above fail)
	npm audit --audit-level=high

check: lint test infra-check ## everything that needs no Docker and no cloud account

down: ## remove leftover act containers
	-docker ps -aq --filter "name=act-" | xargs docker rm -f

clean: down
	rm -rf node_modules dist build coverage $(TF_ENV)/plan.bin $(TF_ENV)/plan.json $(TF_ENV)/.terraform infra/modules/*/.terraform
