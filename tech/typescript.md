# TypeScript

## What it is

TypeScript is JavaScript with **types** added. JavaScript is the language that web pages and Node.js run. In plain JavaScript a variable can hold anything and mistakes show up only when the code runs. In TypeScript you write down what kind of value each thing is (`string`, `number`, a list of numbers, an object with certain fields), and a program called the **compiler** (`tsc`) reads your code *before* it runs and tells you where the kinds do not fit.

Two facts that surprise beginners:

- Types exist only while you write and check. The compiler **erases** them. What actually runs is ordinary JavaScript.
- The compiler can check types, but it cannot check data that arrives while the program runs (a file, a web request). For that you must check the data yourself in code. This repository does that carefully, because its data comes from strangers.

## Why this repository uses it

The lesson needs some code to build and test, and some tools that analyze the workflow files and the cloud trust policy. TypeScript gives both a safety net. The strict settings are on so that a wrong shape is caught early, and the code that handles stranger-controlled text is small and typed.

## Where it appears

| Path | What it is |
| --- | --- |
| `src/` | The "greeter": a tiny program that prints a greeting for a new issue. Split in four layers: `domain`, `application`, `infrastructure`, `interfaces`. |
| `pipeline/` | Tools for CI: `harden-lint.ts` (finds workflow mistakes), `build-result.ts` (validates the result file), `github-comments.ts` (posts a pull request comment), `trust-policy.ts` (models how AWS judges a login). Files ending `-cli.ts` are the command-line wrappers. |
| `tests/` | The tests, in `unit/`, `integration/`, `e2e/` and `pipeline/`. |
| `tsconfig.json`, `tsconfig.build.json` | The compiler settings. |
| `vitest.config.ts`, `eslint.config.js` | Config files that are themselves TypeScript/JavaScript. |

## How it works underneath

1. **Parse.** The compiler turns your text into a tree.
2. **Check.** It walks the tree and works out the type of every expression. If you pass a `number` where a `string` is required, it reports an error.
3. **Emit.** Unless told not to (`--noEmit`), it writes `.js` files (and `.d.ts` files, which hold only the types) into an output folder, with all the types removed.
4. **Run.** Node.js runs the `.js` files. Node knows nothing about the types.

Terms used below:

- **Interface / type**: a name for a shape, such as `{ author: string; title: string }`.
- **`readonly`**: the field cannot be assigned after it is created.
- **Union** (`"success" | "failure"`): the value is one of several.
- **`unknown`**: "I do not know what this is". You must check it before using it. It is the safe opposite of `any`.
- **Generic** (`Generator<PlannedResource>`): a type with a placeholder filled in.
- **Module**: one file that `export`s names and another that `import`s them.

## Walkthrough of this repository's use

### The compiler settings, `tsconfig.json`

```json
"target": "ES2023",
"module": "NodeNext",
"moduleResolution": "NodeNext",
```

`target` is the JavaScript version to write. `module` and `moduleResolution` set to `NodeNext` mean "follow Node's own rules for finding files". One consequence you see everywhere: imports are written with `.js` even though the file on disk is `.ts` (`import { main } from "./interfaces/cli.js"`). The compiler maps it, and after compilation the `.js` file really exists.

```json
"strict": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true,
"noImplicitOverride": true,
"noFallthroughCasesInSwitch": true,
```

`strict` turns on the whole family of strict checks (no implicit `any`, null checks, and so on). `noUncheckedIndexedAccess` makes `list[0]` have type `T | undefined`, because the list might be empty; that is why the code writes `policy.Statement[0]?.Principal.Federated` with a `?.`. `exactOptionalPropertyTypes` separates "the field is missing" from "the field is `undefined`". `noImplicitOverride` demands the word `override` when a class replaces a parent's method. `noFallthroughCasesInSwitch` flags a `case` that forgets `break`.

```json
"verbatimModuleSyntax": true,
"isolatedModules": true,
```

These force `import type { Notifier } from ...` when you import only a type, so that a tool that compiles one file at a time (`tsx`, `vitest`) knows which imports to erase.

```json
"types": ["node"],
"rootDir": ".",
"outDir": "dist"
```

`types: ["node"]` loads the type definitions for Node's built-ins (`@types/node`). `include` and `exclude` choose the files; `exploit/` is excluded because those are lab files.

`tsconfig.build.json` extends it for `npm run build`: only `src`, with `declaration` and `sourceMap` turned on. The `tests/` and `pipeline/` folders are checked (`npm run typecheck`) but not shipped.

### Layers in `src/`

```ts
export class GreetIssue {
  constructor(private readonly notifier: Notifier) {}

  run(author: string, rawTitle: string): void {
    this.notifier.notify(renderGreeting(createGreeting(author, rawTitle)));
  }
}
```

`Notifier` is an `interface` (a promise: "has a `notify(line)` method"). `private readonly notifier` in the constructor parameter is shorthand that declares the field and assigns it. `StreamNotifier` in `infrastructure/` is the real notifier that writes to a stream. The domain layer imports nothing from outside it; ESLint enforces that (see `eslint.config.js` in `eslint.md`).

### Turning a stranger's text into data, `src/domain/greeting.ts`

```ts
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

export function sanitizeTitle(raw: string): string {
  const printable = raw.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
  return printable.length > MAX_TITLE_LENGTH ? `${printable.slice(0, MAX_TITLE_LENGTH - 1)}…` : printable;
}
```

A **regular expression** (`/.../`) describes a pattern. The first one matches invisible control characters (line breaks, escape codes). `replace(..., " ")` swaps each for a space, `\s+` collapses runs of whitespace, `trim()` removes the ends, and a long title is cut to 80 characters with an ellipsis. `createGreeting` also checks the author with `/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/` (a GitHub login: letters, digits and hyphens, at most 39 characters) and throws `GreetingError` otherwise. Note what is *not* done: quotes and `;` are not removed. They are harmless as text. The real defense against shell injection is the `env:` indirection in the workflow, and a test says so ("leaves shell metacharacters alone because they are only ever printed").

### Checking data the compiler cannot see, `pipeline/build-result.ts`

```ts
const record = data as Record<string, unknown>;
const unexpected = Object.keys(record).filter((key) => !["pr", "sha", "conclusion"].includes(key));
...
if (typeof pr !== "number" || !Number.isInteger(pr) || pr < 1 || pr > MAX_PR_NUMBER) { ... }
if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) { ... }
```

`JSON.parse` returns `unknown` data. The function accepts it only if there are exactly the fields `pr`, `sha`, `conclusion`; `pr` is a whole number between 1 and ten million; `sha` is exactly 40 lowercase hexadecimal characters; `conclusion` is one of three words (`CONCLUSIONS ... as const` makes a fixed list whose type is the union `"success" | "failure" | "cancelled"`). Everything else throws `InvalidResultError`. The file came from a job that ran a stranger's code, so none of it is trusted until it passes.

### Calling a web service politely, `pipeline/github-comments.ts`

`GitHubComments.request` calls `fetch` with `signal: AbortSignal.timeout(this.timeoutMs)` (give up after 10 seconds), retries up to three times when the network fails or GitHub answers with a 5xx status, and waits `2 ** (attempt - 1) * 500` milliseconds between tries (500, 1000, ...). A 4xx answer means the caller made a mistake, so `HttpError` with `status < 500` is thrown at once and never retried. `upsertComment` looks for an existing comment that starts with `<!-- pr-report -->` and updates it, otherwise creates one, so re-running does not pile up comments. The class takes `fetchFn` and `sleep` as options so tests can replace them.

### Modeling the cloud's decision, `pipeline/trust-policy.ts`

`evaluate(policy, token, host, providerArn)` copies how AWS reads the trust policy: only `Allow` statements for `sts:AssumeRoleWithWebIdentity`; the principal must name the right identity provider; each condition (`StringEquals`, `StringLike`) is compared with the token's `aud` and `sub` claims. Anything it does not understand counts as "no match" (it **fails closed**). `likeToRegExp` turns IAM wildcards (`*`, `?`) into a regular expression. `scenarios()` lists eight sample tokens with the expected answer. See `oidc.md`.

### The workflow linter, `pipeline/harden-lint.ts`

It reads each workflow with the `yaml` package (see `yaml-library.md`), then applies eight rules (`script-injection`, `privileged-checkout`, `missing-permissions`, `broad-permissions`, `unpinned-action`, `persist-credentials`, `stored-cloud-key`, `oidc-without-environment`). `untrustedReferences` finds every `${{ ... }}` and flags the event fields a stranger can set (`github.event.issue.title`, `github.head_ref`, ...), while `SAFE_EVENT_FIELD` allows numbers GitHub generates, like `github.event.issue.number`.

### The CLI wrappers

`src/main.ts` is three lines: it calls `main({ env: process.env, stdout, stderr })` and stores the returned number in `process.exitCode`. `src/interfaces/cli.ts` reads `ISSUE_AUTHOR` and `ISSUE_TITLE` from the environment and returns exit code 0 (greeted), 1 (unusable issue) or 2 (variable missing). The `-cli.ts` files in `pipeline/` do the same for the tools.

## Try it yourself

1. `npx tsc --version` prints `Version 6.0.3`.
2. `npx tsc -p tsconfig.json --noEmit` prints nothing and exits 0 (types are fine, nothing is written).
3. `npm run build`, then `ISSUE_AUTHOR=octocat ISSUE_TITLE='Build fails on Windows' node dist/main.js` prints `New issue from octocat: Build fails on Windows`. (`dist/` is ignored by git; `rm -rf dist` removes it.)
4. `ISSUE_AUTHOR=octocat ISSUE_TITLE='x"; echo INJECTED; echo "' node dist/main.js` prints the odd title as one line of text; nothing is run.
5. `ISSUE_AUTHOR='$(id)' ISSUE_TITLE=x node dist/main.js; echo $?` prints `greeter: not a valid author login: "$(id)"` and then `1`.

## Mistakes people make

- Believing types protect against bad data at run time. They do not; check data from outside.
- Using `any` to make an error go away; `unknown` plus a check is safer.
- Forgetting `.js` in relative imports when using `NodeNext`.
- Importing a type without `import type` when `verbatimModuleSyntax` is on.
- Sanitizing text and then trusting it in a shell. Clean input helps; separating data from code is the real fix.

## Check yourself

1. What happens to the types when the code runs? *(They are erased; Node runs plain JavaScript.)*
2. Why does `JSON.parse` return `unknown` here and how is it made safe? *(The compiler cannot know the file's contents; `parseResult` checks every field.)*
3. Why does the code write `policy.Statement[0]?.Principal`? *(`noUncheckedIndexedAccess` says the list might be empty.)*
4. Why are imports written `./x.js` in `.ts` files? *(`NodeNext` follows Node's rules, where the real file after compiling is `.js`.)*
5. Why is a 4xx answer not retried but a 5xx is? *(4xx means the request itself is wrong; 5xx may be a temporary server problem.)*

## Further reading

- TypeScript handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- tsconfig reference: https://www.typescriptlang.org/tsconfig/
- TypeScript 6.0 release notes: https://devblogs.microsoft.com/typescript/
