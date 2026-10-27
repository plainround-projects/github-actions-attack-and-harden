# Git: commits, tags and `.gitignore`

## What it is

Git is a version-control system. It records snapshots of a folder (**commits**) so you can see history, undo mistakes and share work. A **repository** is the folder plus its history in a hidden `.git` folder. A **commit** has a 40-character fingerprint, its **SHA**, computed from its contents, its message and its parent commit. A **tag** is a name attached to a commit. A **branch** is a name that moves forward as you commit. `.gitignore` lists files Git must not track.

## Why this repository uses it

A large part of the lesson is about what Git names mean. A tag such as `v7.0.1` can be moved by its owner; a commit's 40-character SHA cannot. That is why every action here is pinned to a SHA. Git also keeps secrets out (through `.gitignore`), and the checkout step can leave a token inside `.git/config` unless told not to.

## Where it appears

| Path | What it is |
| --- | --- |
| `.gitignore` | Keeps `node_modules/`, `dist/`, `build/`, `coverage/`, `.env`, Terraform state and plans, `demo.tfvars` and `.tools/` out. |
| `.github/workflows/*.yml` | `uses: owner/action@<40-hex SHA> # vX.Y.Z`; `persist-credentials: false`. |
| `scripts/lab.sh` | `git ls-files -z | xargs -0 ... rsync -aR` copies exactly the tracked files. |
| `pipeline/harden-lint.ts` | Rules `unpinned-action` and `persist-credentials`. |
| `.github/workflows/deploy.yml` | Uploads to a path named by `${GITHUB_SHA}`, the commit being deployed. |

## How it works underneath

Git stores four kinds of objects, each named by its SHA: **blobs** (file contents), **trees** (folders), **commits** and **tag objects**. A commit points to one tree (the whole snapshot) and its parent commit. A **lightweight tag** is only a name that points at a commit. An **annotated tag** (`git tag -a`) is its own object with a message, a tagger and a date, and points at a commit; the commit is what `ref^{commit}` reaches. A tag name is a file that holds a SHA, so it can be changed with `git tag -f`; a SHA cannot be changed, because changing the contents changes the SHA.

## Walkthrough of this repository's use

### Pinning

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

A commit's SHA is a fingerprint computed from its content and its parents. Change anything and the SHA changes; so a SHA names exactly one state of the code. A tag is only a label pointing at a commit; whoever can push to the repository can point it elsewhere. A compromised or careless owner moving `v7` to new code would change what every workflow using `@v7` runs, with the secrets those workflows hold. Pinning removes that. You can check the pairing yourself:

```bash
git ls-remote https://github.com/actions/checkout v7.0.1
```

prints `3d3c42e5aac5ba805825da76410c181273ba90b1  refs/tags/v7.0.1` (at the time of writing). The comment after the SHA is for people and for Dependabot (see `dependabot.md`). The linter's regular expression is `^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$`: owner/name, an `@`, and exactly 40 lowercase hex characters. Local actions (`./...`) and `docker://` images are exempt.

### `persist-credentials: false`

By default `actions/checkout` stores the job's `GITHUB_TOKEN` in `.git/config` so later `git push` commands work. Any later step, including one running the pull request's code, could read it from there. Every checkout here sets `persist-credentials: false`; the linter warns (and under a privileged trigger errors) otherwise.

### What the lab copies

```bash
git ls-files -z | xargs -0 -I{} rsync -aR "{}" "$logs/fork-hardened/"
```

`git ls-files` lists the files Git tracks; `-z` separates names with a NUL character so unusual names survive; `xargs -0 -I{}` runs `rsync -aR` once per name, preserving the folder path. The copy has no `node_modules`, build output or local secrets.

### `.gitignore`

```text
node_modules/
dist/
...
.env
.terraform/
*.tfstate
*.tfstate.*
plan.bin
plan.json
demo.tfvars
```

Each line is a pattern for paths Git should pretend not to see. Dependencies and build output are rebuilt from the lock file; Terraform state and plans can hold secrets; `.env` and `demo.tfvars` hold your own values.

### The deployment path

`aws s3 sync dist "s3://${BUCKET}/releases/${GITHUB_SHA}/"`: `GITHUB_SHA` is the commit that triggered the run. Every release lands in a folder named by its exact commit.

## Try it yourself

1. `git log --oneline | head -3` shows the latest commits with short SHAs.
2. `git ls-files | wc -l` counts the tracked files (90 at the time of writing).
3. `git check-ignore -v node_modules plan.bin` shows which `.gitignore` line matches each path.
4. `git ls-remote https://github.com/actions/checkout v7.0.1` prints the commit the tag points to (needs network); compare it with the SHA in `ci.yml`.
5. `grep -c "persist-credentials: false" .github/workflows/*.yml` counts one per checkout in each workflow.

## Mistakes people make

- Thinking a tag is permanent. Anyone with push rights can move it.
- Pinning a SHA that belongs to a fork rather than the real repository.
- Pinning without a version comment, so nobody knows what it is.
- Leaving the checkout token in `.git/config`.
- Committing `.env`, state files or `node_modules`.

## Check yourself

1. What is the difference between a tag and a SHA? *(A tag is a movable name; a SHA is the fingerprint of one exact commit.)*
2. Why does the linter require 40 hex characters? *(Shorter forms and tags can be changed or made ambiguous.)*
3. What does `persist-credentials: false` do? *(Stops checkout from storing the token in `.git/config`.)*
4. What does `git ls-files -z` plus `xargs -0` protect against? *(File names with spaces or odd characters.)*
5. Why does `.gitignore` list Terraform plans and state? *(They can contain secrets.)*

## Further reading

- Pro Git book: https://git-scm.com/book/en/v2
- `git rev-parse`: https://git-scm.com/docs/git-rev-parse
- `git archive`: https://git-scm.com/docs/git-archive
- Pathspecs: https://git-scm.com/docs/gitglossary#def_pathspec
