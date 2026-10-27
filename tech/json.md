# JSON

## What it is

JSON (JavaScript Object Notation) is a plain-text format for structured data. It has only these building blocks:

- **Object**: `{ "name": "value", "other": 3 }`, a set of named fields. Names are always in double quotes.
- **Array**: `[1, 2, 3]`, an ordered list.
- **String**: `"text"` in double quotes. Special characters are written with a backslash: `\"` (a quote), `\n` (a new line), `é` (a character by code).
- **Number**: `42`, `3.14`.
- **Boolean**: `true` or `false`.
- **null**: `null`.

That is all. JSON has **no comments**, no trailing commas and no single quotes. Almost every programming language and every web service can read and write it, which is why it is the common exchange format.

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **command line**: The text you type after the prompt in a terminal to run a program, such as `npm test`. The words after the program name are its **arguments**; words that start with `-` or `--` are **options** (also called flags).
- **shell**: The program inside a terminal that reads what you type and starts other programs. Bash is a shell.
- **environment variable**: A named piece of text that is handed to a program by whoever starts it, for example `HOME` or `CI`. Programs read them to learn about the setting they run in.
- **hash**: A fixed-length fingerprint computed from some data. The same data always gives the same hash; any change gives a different one. SHA-256 and SHA-1 are two ways of computing one.
- **commit**: A saved snapshot of a project's files in Git, with a message and an author. Every commit has a unique 40-character name (its SHA).
- **branch**: A movable name for a line of commits in Git. `main` is the usual name of the primary line.
- **pull request**: A proposal on GitHub to merge the commits of one branch into another. People review it and automation checks it before it is merged.
- **fork**: Your own copy of someone else's repository on GitHub. Strangers propose changes by changing their fork and opening a pull request from it.
- **repository**: A project's folder of files together with its complete history of changes. On GitHub, a repository is a page with those files, issues and pull requests.
- **workflow**: A GitHub Actions automation described in a YAML file under `.github/workflows/`. It names the events that start it and the jobs it runs.
- **secret**: A value such as a password stored in a repository's settings. Workflows can read it, but GitHub hides it in logs.
- **API**: Application programming interface: a set of requests a program can send to another program or service, with documented answers. A web API is called over the internet with HTTP.
- **package**: A bundle of code someone published for others to use, installed by a package manager such as npm or pip.
- **lock file**: A file that records the exact version, and a checksum, of every package that was installed, so that everyone installs exactly the same thing.
- **variable**: A name for a place that holds a value which can be used later in the code.
- **list**: An ordered collection of values written one after another.
- **version**: A number such as `1.2.3` that names one release of software (major.minor.patch).
- **compiler**: A program that translates code written in one language into another form, and checks it on the way.

</details>

<!-- /words -->

## Why this repository uses it

Many things here are JSON: the project descriptions (`package.json`, `package-lock.json`, `tsconfig.json`), the Prettier settings, the fake event payloads that GitHub would send, the result file passed between workflows, the plan Terraform produces, and the answers of the GitHub API. Each is a place where data crosses a boundary, so each is a place to be careful.

## Where it appears

| Path | What it holds |
| --- | --- |
| `package.json`, `package-lock.json` | See `npm.md`. |
| `tsconfig.json`, `tsconfig.build.json` | Compiler settings (see `typescript.md`). |
| `.prettierrc.json` | `{ "printWidth": 120, "tabWidth": 2, "singleQuote": false, "trailingComma": "all" }`. |
| `exploit/events/*.json` | Fake GitHub event payloads for `act -e`. |
| `exploit/vulnerable/package.json` | The lab project whose `build` script the "fork" replaces. |
| `result.json` | Written by `pr-build.yml` with `jq`, read by `pipeline/build-result.ts`. |
| `infra/environments/demo/plan.json` | Output of `terraform show -json plan.bin`, read by `check-trust-cli.ts`. |
| IAM policies | The trust policy and permission policy inside the Terraform are JSON text produced by `jsonencode`. |

## How it works underneath

**Parsing** means reading the text and building the data in memory. In JavaScript: `JSON.parse(text)` returns the value, or throws if the text is not valid JSON. **Serializing** is the reverse: `JSON.stringify(value)` returns text. `JSON.stringify(value, null, 2)` indents with two spaces so people can read it.

Two cautions:

1. A value from `JSON.parse` has an unknown shape. Valid JSON can still be a surprise: an array where you wanted an object, a number where you wanted a string. Check it.
2. The text of a JSON *string* can contain anything: quotes, newlines, shell characters. Never paste such a string into a command line. Use a tool that handles quoting (like `jq`), or pass it through an environment variable.

## Walkthrough of this repository's use

An event payload, `exploit/events/issue-injection.json`:

```json
{
  "action": "opened",
  "issue": {
    "number": 7,
    "title": "Looks fine\"; echo INJECTED-COMMAND-RAN; echo \"",
    "user": { "login": "outside-contributor" }
  },
  "repository": { "full_name": "owner/vulnerable-demo" },
  "sender": { "login": "outside-contributor" }
}
```

This is the shape GitHub sends when an issue is opened (trimmed to the fields the lab uses). The title field is a JSON string; `\"` is an escaped quote. After parsing, the title is exactly `Looks fine"; echo INJECTED-COMMAND-RAN; echo "`: a quote, a semicolon, a second command, and another quote. This is the attack-1 payload. `act` reads the file and exposes it to the workflow as `github.event`, so `github.event.issue.title` is that string.

`exploit/events/pull-request-from-fork.json` has `"head": { "repo": { "full_name": "outside-contributor/vulnerable-demo", "fork": true } }`: the stranger's copy of the repository, with the commit hash `0000...0000` (forty zeros) as a placeholder.

The result file, built in `pr-build.yml` by `jq -n` and validated by `pipeline/build-result.ts`:

```json
{ "pr": 3, "sha": "0123456789abcdef0123456789abcdef01234567", "conclusion": "success" }
```

`parseResult` rejects extra fields, a `pr` that is not a whole number from 1 to 10,000,000, a `sha` that is not forty lowercase hex characters, and any `conclusion` outside the three words.

`apply-fork-change.mjs` reads a `package.json`, sets `pkg.scripts.build` and writes it back with `JSON.stringify(pkg, null, 2)` plus a final newline.

`plan.json` (not committed) is large; `check-trust-cli.ts` walks `planned_values.root_module`, including `child_modules`, to find the resource of type `aws_iam_role` and parses its `assume_role_policy`, which is a JSON string *inside* the JSON. That is why it calls `JSON.parse` twice.

<!-- walk:exploit/events/pull-request-from-fork.json -->
### `exploit/events/pull-request-from-fork.json`, line by line

Lines 1 to 29:

```json
{
  "action": "opened",
  "number": 3,
  "pull_request": {
    "number": 3,
    "title": "Speed up the build",
    "user": { "login": "outside-contributor" },
    "head": {
      "ref": "speed-up",
      "sha": "0000000000000000000000000000000000000000",
      "repo": { "full_name": "outside-contributor/vulnerable-demo", "fork": true }
    },
    "base": { "ref": "main", "repo": { "full_name": "owner/vulnerable-demo" } }
  },
  "repository": { "full_name": "owner/vulnerable-demo" },
  "sender": { "login": "outside-contributor" }
}
```

The event payload for a pull request opened from a fork, trimmed to what the lab uses: `action` is `opened`; `number` and `pull_request.number` are 3; the pull request has a title, an author (`user.login`), and a `head` (the fork's branch: `ref` the branch name, `sha` a placeholder of forty zeros, `repo.full_name` of the fork, `fork: true`) and a `base` (the target: branch `main` of `owner/vulnerable-demo`). `repository` and `sender` repeat the repository and the person who acted. `act` hands this JSON to the workflow as `github.event`.

<!-- /walk:exploit/events/pull-request-from-fork.json -->

<!-- walk:exploit/events/issue-plain.json -->
### `exploit/events/issue-plain.json`, line by line

Lines 1 to 9:

```json
{
  "action": "opened",
  "issue": {
    "number": 8,
    "title": "Build fails on Windows",
    "user": { "login": "outside-contributor" }
  },
  "repository": { "full_name": "owner/vulnerable-demo" },
  "sender": { "login": "outside-contributor" }
```

The same shape as the injection event, with an ordinary title `Build fails on Windows` and number 8. It is the control: the hardened workflow must print it as it is.

<!-- /walk:exploit/events/issue-plain.json -->

<!-- walk:exploit/vulnerable/package.json -->
### `exploit/vulnerable/package.json`, line by line

Lines 1 to 8:

```json
{
  "name": "vulnerable-demo",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "echo building"
  }
}
```

A minimal project file for the lab: a name, a version, `private: true` (npm refuses to publish it), and a `build` script that only echoes `building`. The fork's change replaces that script.

<!-- /walk:exploit/vulnerable/package.json -->

<!-- walk:package.json -->
### `package.json`, line by line

Lines 1 to 18:

```json
{
  "name": "attack-and-harden",
  "version": "1.0.0",
  "description": "A repository that was deliberately vulnerable, hardened: script injection, a privileged fork build, a write token, and OIDC with a protected environment.",
  "private": true,
  "license": "MIT",
  "author": "Sumit Srivastava",
  "type": "module",
  "engines": {
    "node": ">=22.12"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write .",
    "test": "vitest run --coverage"
  },
```

The project's identity and settings: `name`, `version`, `description`, `private`, `license`, `author`, `type: module` (files are ES modules), `engines.node` (Node 22.12 or newer) and the five `scripts`.

Lines 19 to 32:

```json
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.19.2",
    "@vitest/coverage-v8": "5.0.5",
    "eslint": "10.13.0",
    "prettier": "3.9.10",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "typescript-eslint": "8.72.1",
    "vite": "7.3.7",
    "vitest": "5.0.5",
    "yaml": "2.9.1"
  }
}
```

`devDependencies`: the packages needed only for building, checking and testing, each with an **exact** version (no `^`): `@eslint/js`, `@types/node` (type definitions for Node), `@vitest/coverage-v8`, `eslint`, `prettier`, `tsx`, `typescript`, `typescript-eslint`, `vite`, `vitest` and `yaml`. The lock file records their exact dependencies too.

<!-- /walk:package.json -->

## Try it yourself

1. `node -e "console.log(JSON.parse(require('fs').readFileSync('exploit/events/issue-injection.json','utf8')).issue.title)"` prints `Looks fine"; echo INJECTED-COMMAND-RAN; echo "`.
2. `node -e "JSON.parse('{bad}')"` fails with `SyntaxError`.
3. `node -e "console.log(JSON.stringify({a:1,b:[2,3]}, null, 2))"` prints the indented form.
4. `jq .issue.number exploit/events/issue-plain.json` prints `8`.
5. `cat .prettierrc.json` shows the four formatting options.

## Mistakes people make

- Adding a comment or a trailing comma to a JSON file.
- Using single quotes.
- Building JSON by gluing strings together; quotes in the data break it. Use `JSON.stringify` or `jq`.
- Trusting the shape of parsed data.
- Putting a secret in a JSON file in the repository.

## Check yourself

1. Can JSON have comments? *(No.)*
2. What does `JSON.parse` do with invalid text? *(Throws an error.)*
3. Why does the lab's title field contain `\"`? *(A literal double quote inside a JSON string must be escaped.)*
4. Why does `check-trust-cli.ts` parse twice? *(The policy is a JSON string stored inside the plan's JSON.)*
5. Why validate `result.json` field by field? *(It was produced by a job that ran a stranger's code.)*

## Further reading

- JSON specification (ECMA-404): https://ecma-international.org/publications-and-standards/standards/ecma-404/
- MDN, `JSON.parse` and `JSON.stringify`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON
