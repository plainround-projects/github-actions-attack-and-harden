# npm, package.json and the lock file

## What it is

npm is the package manager of the Node.js world. A **package** is a folder of code someone else wrote and published, such as `vitest` or `yaml`. A project lists the packages it needs, and npm downloads them (and the packages *they* need) into a folder called `node_modules/`.

Three files and one folder matter:

- **`package.json`**: the project's description and the list of wanted packages with their versions, plus named commands (`scripts`).
- **`package-lock.json`**: the exact versions npm actually chose for every package, including the packages of packages, each with a **checksum**.
- **`.npmrc`**: settings for npm itself.
- **`node_modules/`**: where the downloaded code lands. It is never committed.

A package can also run code on your machine *while installing*, through "install scripts". That is a security risk, and this repository turns it off.

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **shell**: The program inside a terminal that reads what you type and starts other programs. Bash is a shell.
- **hash**: A fixed-length fingerprint computed from some data. The same data always gives the same hash; any change gives a different one. SHA-256 and SHA-1 are two ways of computing one.
- **commit**: A saved snapshot of a project's files in Git, with a message and an author. Every commit has a unique 40-character name (its SHA).
- **repository**: A project's folder of files together with its complete history of changes. On GitHub, a repository is a page with those files, issues and pull requests.
- **workflow**: A GitHub Actions automation described in a YAML file under `.github/workflows/`. It names the events that start it and the jobs it runs.
- **runner**: The computer, usually a virtual machine, on which GitHub runs a job. It starts clean for every job.
- **CI**: Continuous integration: running checks (build, tests, linters) automatically every time code changes.
- **URL**: A web address such as `https://api.github.com/zen`.
- **YAML**: A plain-text format for structured data that uses indentation instead of braces. GitHub workflows are YAML files.
- **library**: A package of ready-made code that your program calls.
- **cache**: A saved copy of something slow to produce (such as downloaded packages), kept so the next run can reuse it.
- **list**: An ordered collection of values written one after another.
- **folder**: A container for files and other folders on disk (also called a directory).
- **version**: A number such as `1.2.3` that names one release of software (major.minor.patch).
- **compiler**: A program that translates code written in one language into another form, and checks it on the way.

</details>

<!-- /words -->

## Why this repository uses it

The project needs a test runner, linters, a compiler and one YAML library. It also teaches supply-chain safety next to workflow safety: the same care that pins an action to a commit applies to pinning packages to exact versions and refusing install scripts.

## Where it appears

| Path | What it does |
| --- | --- |
| `package.json` | Project name, `"type": "module"`, `engines`, `scripts`, `devDependencies` pinned to exact versions. |
| `package-lock.json` | The full tree, 192 checksums. Committed. |
| `.npmrc` | `audit-level=high`, `fund=false`. |
| `Makefile` | `npm ci --ignore-scripts` creates `node_modules`; `npm audit --audit-level=high`. |
| `.github/workflows/*.yml` | `npm ci --ignore-scripts`, `npm run ...`, `npm audit`; `actions/setup-node` with `cache: npm`. |
| `.github/dependabot.yml` | An `npm` entry that proposes version bumps weekly. |

## How it works underneath

### Version numbers and ranges

A version looks like `5.0.5` (major.minor.patch). In many projects `package.json` has ranges like `^5.0.5` ("5.0.5 or any newer 5.x"). Ranges let new releases slip in. This repository writes **exact** versions without `^`:

```json
"vitest": "5.0.5",
"typescript": "6.0.3"
```

### Why two files

`package.json` says what you *want*; `package-lock.json` says what you *got*. For each package the lock stores the exact version, the URL it came from, and an `integrity` value, a SHA-512 hash of the downloaded archive:

```json
"node_modules/yaml": {
  "version": "2.9.1",
  "resolved": "https://registry.npmjs.org/yaml/-/yaml-2.9.1.tgz",
  "integrity": "sha512-3NxN8+...",
  "dev": true,
```

When npm installs, it recomputes the hash of what it downloaded and refuses if it differs. A tampered package with the same version number fails the check.

### `npm install` versus `npm ci`

- `npm install` may change the lock file.
- `npm ci` ("clean install") deletes `node_modules`, installs exactly what the lock says, and **fails** if `package.json` and the lock disagree. CI should use it, so what runs on the build machine is what was reviewed.

### Install scripts

A package can declare `preinstall` / `postinstall` scripts that npm runs automatically. Malicious packages use them to steal tokens at install time. `--ignore-scripts` skips them. The cost: a package that genuinely needs a build step on install will not get it; none of this repository's packages do.

### `dependencies` versus `devDependencies`

`devDependencies` are only needed to build and test. All of this project's are dev dependencies, because the greeter has no run-time packages.

### The lifecycle of `scripts`

`npm run test` looks up `"test"` in `scripts` and runs that text in a shell, with `node_modules/.bin` on the `PATH` (so `vitest`, `tsc`, `eslint` can be called by bare name). `npm test` is a shortcut for `npm run test`. `npx tool` runs a tool from `node_modules/.bin`.

### `npm audit`

Asks the registry whether any installed version has a known security advisory. `--audit-level=high` makes it fail only for *high* or *critical* ones.

## Walkthrough of this repository's use

```json
"scripts": {
  "build": "tsc -p tsconfig.build.json",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "lint": "eslint . && prettier --check .",
  "format": "prettier --write .",
  "test": "vitest run --coverage"
},
```

`build` compiles `src/` with the build config. `typecheck` checks everything without writing files. `lint` runs ESLint over the whole project and, only if that passes (`&&`), checks formatting with Prettier. `format` rewrites files to the Prettier style. `test` runs the tests once with coverage.

```json
"private": true,
"type": "module",
"engines": { "node": ">=22.12" },
```

`private: true` makes npm refuse to publish this project by accident. `type: module` was explained in `node.md`. `engines` is a warning if Node is too old.

The eleven dev dependencies (`@eslint/js`, `@types/node`, `@vitest/coverage-v8`, `eslint`, `prettier`, `tsx`, `typescript`, `typescript-eslint`, `vite`, `vitest`, `yaml`) each have their own note except `@types/node` (type definitions for Node, used by `typescript.md`) and `vite` (the build tool that Vitest is built on; version-matched with it).

```text
audit-level=high
fund=false
```

(`.npmrc`.) `audit-level=high` is the default failure threshold for `npm audit`. `fund=false` hides the "N packages are looking for funding" message.

In the Makefile:

```make
$(STAMP): package-lock.json
	npm ci --ignore-scripts
	touch $@
```

`STAMP` is `node_modules/.installed`. The rule says "this marker file depends on the lock file; rebuild it, by running `npm ci`, when the lock is newer". `touch` creates or updates the marker. So `make install` reinstalls only when the lock changed.

In workflows, `actions/setup-node` with `cache: npm` stores npm's download cache between runs, keyed by the lock file's hash, and `npm ci --ignore-scripts` installs.

## Try it yourself

1. `npm --version` prints the npm version.
2. `npm ls --depth=0` lists the eleven top-level packages with their exact versions.
3. `npm audit --audit-level=high; echo $?` ends with `found 0 vulnerabilities` and `0`.
4. `grep -c '"integrity"' package-lock.json` prints the number of checksummed packages (192 at the time of writing).
5. `npm run` lists the five scripts.

## Mistakes people make

- Using `npm install` in CI and silently changing versions.
- Committing `node_modules/`.
- Using `^` ranges and assuming the build is the same tomorrow.
- Running install scripts of packages you have not reviewed.
- Editing `package-lock.json` by hand.

## Check yourself

1. What is the difference between `package.json` and `package-lock.json`? *(What you want versus the exact result, with checksums.)*
2. Why `npm ci` in CI? *(It installs exactly the lock and fails on a mismatch.)*
3. What does `--ignore-scripts` protect against? *(A package running code on your machine at install time.)*
4. What does `npm run lint` do if ESLint fails? *(Stops; Prettier is not run, because of `&&`.)*
5. What does `integrity` guard? *(That the downloaded archive is the one the lock file recorded.)*

## Further reading

- npm CLI docs: https://docs.npmjs.com/cli/v11/commands
- `package.json` fields: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- `npm ci`: https://docs.npmjs.com/cli/v11/commands/npm-ci
- Config (`.npmrc`, `audit-level`, `fund`): https://docs.npmjs.com/cli/v11/using-npm/config
