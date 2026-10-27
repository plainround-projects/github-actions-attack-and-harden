# TypeScript

## What it is

A **programming language** is a way of writing instructions that a computer can follow. **JavaScript** is a programming language that was invented for web pages and later became one of the most used languages everywhere. A program written in JavaScript is a plain text file, usually ending in `.js`. Another program, called a **runtime** (here Node.js, see `node.md`), reads that file and carries out the instructions.

JavaScript lets you put any kind of value into any variable. A **variable** is a name for a place that holds a value. In JavaScript the same variable can hold a number now and a piece of text later, and mistakes like adding a number to a word only show up when the program runs and misbehaves.

**TypeScript** is JavaScript with one addition: **types**. A type says what kind of value something is: text (`string`), a number (`number`), true or false (`boolean`), a list of numbers (`number[]`), or an object with named parts. You write the types next to your code. A separate program, the **compiler** (named `tsc`, "TypeScript compiler"), reads your files before anything runs and reports every place where the kinds do not fit together, for example passing a number where text is required.

Two facts that surprise beginners:

1. **Types disappear.** The compiler checks the types and then removes them. What actually runs is ordinary JavaScript with no types in it. Types are only a safety net while you write.
2. **Types cannot see data that arrives while the program runs.** If a file or a web request gives your program text, the compiler has no idea what is inside. Your own code has to check it. This repository does that carefully, because some of its data comes from strangers.

A file ending in `.ts` is a TypeScript file. This repository's TypeScript files are all **modules**: each file is a unit that can `export` names (functions, classes, constants) for other files to `import`.

## Why this repository uses it

The lesson needs a small program to build and test, and CI tools that inspect workflow files and a cloud trust policy. Those tools handle text typed by strangers (an issue title, a result file from a build that ran untrusted code). TypeScript's strict mode makes it hard to forget a case, and the small, typed functions are easy to test. The code has four jobs:

- `src/`: the **greeter**, a tiny program that prints one line of greeting for a new issue (this is the "application" that `npm run build` builds).
- `pipeline/`: tools used by CI: the workflow linter (`harden-lint`), the validator for the result file (`build-result`), the comment poster (`github-comments`), and a model of AWS's login check (`trust-policy`).
- `tests/`: the automated tests (explained in `vitest.md`).
- Config files that are themselves written in TypeScript or JavaScript: `vitest.config.ts`, `eslint.config.js`.

## Where it appears

| Path | What it does |
| --- | --- |
| `tsconfig.json` | The compiler settings for checking everything. |
| `tsconfig.build.json` | Settings for `npm run build`; extends the first one. |
| `src/main.ts` | Entry point of the greeter: three lines. |
| `src/interfaces/cli.ts` | Reads the environment, calls the use case, picks the exit code. |
| `src/application/greet-issue.ts` | The use case `GreetIssue` and the `Notifier` interface. |
| `src/domain/greeting.ts` | The rules about a greeting: sanitizing the title, checking the author. |
| `src/domain/errors.ts` | The `GreetingError` class. |
| `src/infrastructure/stream-notifier.ts` | A `Notifier` that writes to an output stream. |
| `pipeline/build-result.ts` | Validates the result file; renders the comment text. |
| `pipeline/github-comments.ts` | Talks to GitHub's web API with timeout and retry. |
| `pipeline/post-result-cli.ts` | Command-line wrapper that posts the comment. |
| `pipeline/trust-policy.ts` | Model of how AWS decides whether a login token may assume the role. |
| `pipeline/check-trust-cli.ts` | Command-line wrapper that checks the real planned policy. |
| `pipeline/harden-lint.ts` | The workflow linter (eight rules). |
| `pipeline/harden-lint-cli.ts` | Command-line wrapper for the linter. |
| `tests/**/*.test.ts` | The ten test files (see `vitest.md`). |
| `vitest.config.ts`, `eslint.config.js` | Configuration written as code (see `vitest.md`, `eslint.md`). |

## How it works underneath

### From text to a running program

1. **You write** `src/main.ts`. It is plain text.
2. **The compiler reads it** (`npx tsc`). It first **parses** the text: it breaks it into words and symbols (called tokens) and arranges them into a tree that shows which part belongs to which (for example which expression is the argument of which function call).
3. **It checks.** For every expression it works out the type. If you wrote `const n: number = "x"`, the types disagree and it prints an error with the file and line.
4. **It emits.** If asked to (it is not asked with `--noEmit`), it writes a `.js` file for each `.ts` file, with all the type notes removed, plus `.d.ts` files (which only describe the types, for other programmers) and `.js.map` files (which connect the output back to your source lines so error messages can point to the original).
5. **Node runs** the `.js` file. Node knows nothing about types.

### Modules

`export` makes a name available outside its file. `import { main } from "./interfaces/cli.js"` loads that file (once) and gives you the exported name `main`. `import type { Notifier } from ...` imports a name that exists only as a type; it leaves no trace in the output.

### Types you will meet in this repository

- **Primitive types:** `string`, `number`, `boolean`, `void` (a function returns nothing), `undefined`, `null`.
- **Object types / interfaces:** `interface Greeting { readonly author: string; readonly title: string }` names a shape. `readonly` means the field cannot be changed after creation.
- **Union types:** `"success" | "failure" | "cancelled"` means the value is exactly one of those three texts. `string | undefined` means text or nothing.
- **Arrays:** `string[]` is a list of texts. `readonly string[]` is a list that cannot be modified.
- **Generics:** `Promise<void>`, `Record<string, unknown>`, `Generator<PlannedResource>` are types with a part filled in (`Promise<void>` is "a future result that has no value").
- **`unknown`:** "I do not know what this is, and I must check it before using it." It is the safe type for data from outside.
- **Type assertions:** `value as Plan` tells the compiler "trust me, this has the type `Plan`". It does **not** check anything. Where the code uses it, the data has been validated by other means or the data comes from a tool this repository controls.

### Errors

A program can stop a task by **throwing an exception**: `throw new Error("message")`. The code that called it can catch it with `try { ... } catch (error) { ... }`. If nobody catches it, the program stops and Node prints it.

## Walkthrough of this repository's use

### `tsconfig.json`: the compiler settings

`tsconfig.json` is a JSON file (see `json.md`). Every line:

```json
"target": "ES2023",
```

`target` is the version of JavaScript to produce. ES2023 is the 2023 edition of the language standard; Node 22 understands it, so the compiler can leave modern features alone instead of rewriting them.

```json
"module": "NodeNext",
"moduleResolution": "NodeNext",
```

These two tell the compiler to follow Node's own rules for modules. Two consequences. First, because `package.json` says `"type": "module"`, files are treated as ES modules (the `import`/`export` kind). Second, an import must name the file the way Node will see it **after** compilation: so the source says `import { main } from "./interfaces/cli.js"` even though the file on disk is `cli.ts`. The compiler understands that `.js` means "the compiled form of `cli.ts`".

```json
"strict": true,
```

Turns on the whole family of strict checks: variables must have a known type, `null` and `undefined` must be handled, functions must be called with the right number and kind of arguments, and more.

```json
"noUncheckedIndexedAccess": true,
```

Reading `list[0]` gives `T | undefined`, because the list might be empty. This is why you will see `policy.Statement[0]?.Principal` with a `?`. (`?.` means "if the thing before is `undefined`, stop and give `undefined`".)

```json
"exactOptionalPropertyTypes": true,
```

An optional field (`readonly baseUrl?: string`) may be missing, but may not be present with the value `undefined`. The code respects it in places like `...(payload === undefined ? {} : { body: ... })`, which adds a field only when there is a value.

```json
"noImplicitOverride": true,
"noFallthroughCasesInSwitch": true,
```

`noImplicitOverride`: a class method that replaces a parent's method must say `override`. `noFallthroughCasesInSwitch`: in a `switch` statement, a `case` that has code must end with `return` or `break`, so you do not slide into the next case by accident.

```json
"verbatimModuleSyntax": true,
"isolatedModules": true,
```

`verbatimModuleSyntax`: what you write for imports is what is emitted, so importing something that is only a type must use `import type`. `isolatedModules`: every file must be understandable on its own. Tools such as `tsx` and Vitest compile one file at a time and need this.

```json
"esModuleInterop": true,
"skipLibCheck": true,
"types": ["node"],
```

`esModuleInterop` smooths over differences between old and new module styles. `skipLibCheck` skips type-checking of the `.d.ts` files inside `node_modules`, which saves time and avoids errors in other people's declarations. `types: ["node"]` loads the type definitions for Node's built-in names (from the `@types/node` package), so the compiler knows what `process` and `node:fs` are.

```json
"rootDir": ".",
"outDir": "dist"
```

`rootDir` is the base folder for source files; `outDir` is where compiled files go if emitted.

```json
"include": ["src", "pipeline", "tests", "vitest.config.ts", "eslint.config.js"],
"exclude": ["node_modules", "dist", "build", "exploit"]
```

Which files belong to the project: the four folders and the two config files; but not the dependencies, the output folders, or `exploit/` (the lab's deliberately weak files).

`tsconfig.build.json` extends it:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "declaration": true, "sourceMap": true },
  "include": ["src"]
}
```

`extends` copies every setting from the first file and then changes some. For the build, only `src` is compiled; `rootDir` becomes `src` so the output is `dist/main.js` and not `dist/src/main.js`; `declaration` writes the `.d.ts` files; `sourceMap` writes the `.js.map` files. The two npm commands: `npm run build` is `tsc -p tsconfig.build.json` (`-p` means "use this project file") and `npm run typecheck` is `tsc -p tsconfig.json --noEmit` (`--noEmit` means check only, write nothing).

### `src/main.ts`: the entry point

```ts
import { main } from "./interfaces/cli.js";

process.exitCode = main({ env: process.env, stdout: process.stdout, stderr: process.stderr });
```

`process` is a global object that Node provides; it stands for the running program. `process.env` is an object holding the **environment variables** (named text values that the program's starter hands to it; for example `PATH`). `process.stdout` and `process.stderr` are the two **output streams**: standard output is where normal results go, standard error is where problems go. The program calls `main` with those three things and stores the number it returns in `process.exitCode`. When the program ends, that number is its **exit code**: 0 means success, any other number means failure. CI reads the exit code to decide whether a step passed. Passing the three things in as arguments, instead of letting `main` grab the globals, is what lets tests call `main` with fake ones.

### `src/interfaces/cli.ts`: reading the environment, choosing the exit code

```ts
import { GreetIssue } from "../application/greet-issue.js";
import { GreetingError } from "../domain/errors.js";
import { StreamNotifier } from "../infrastructure/stream-notifier.js";
```

Three imports from the other layers.

```ts
export interface CliIo {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}
```

An `interface` describes a shape. `CliIo` has three fields. `Record<string, string | undefined>` is "an object whose keys are text and whose values are text or `undefined`" (an environment variable may be missing). `Readonly<...>` forbids changing it. `{ write(chunk: string): unknown }` is the smallest possible description of an output stream: "something with a `write` method that accepts text". Describing only what the code uses lets tests supply a simple fake.

```ts
export function main(io: CliIo): number {
  const { ISSUE_AUTHOR: author, ISSUE_TITLE: title } = io.env;
```

`export function main(io: CliIo): number` declares a function named `main`, with one **parameter** `io` of type `CliIo`, which **returns** a `number`. The next line is **destructuring**: take the fields `ISSUE_AUTHOR` and `ISSUE_TITLE` out of `io.env` and give them the local names `author` and `title`. `const` declares a name that cannot be assigned again.

```ts
  if (author === undefined || title === undefined) {
    io.stderr.write("greeter: set ISSUE_AUTHOR and ISSUE_TITLE\n");
    return 2;
  }
```

If either variable is missing, write a message to standard error (`\n` is a line break) and return 2. Exit code 2 means "wrong usage". `===` is "equal, with the same type"; `||` means "or".

```ts
  try {
    new GreetIssue(new StreamNotifier(io.stdout)).run(author, title);
    return 0;
  } catch (error) {
    if (error instanceof GreetingError) {
      io.stderr.write(`greeter: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
```

`new GreetIssue(...)` creates an object from a class (explained below). The `try` block runs the use case; if it finishes, return 0. If it **throws**, control jumps to `catch (error)`. `error instanceof GreetingError` checks whether the thrown thing is a `GreetingError` (our own "unusable issue" error). If so, print the reason (backtick strings with `${...}` insert values; these are **template literals**) and return 1. Any other error is a bug, so `throw error` re-throws it rather than hiding it.

### `src/domain/errors.ts`

```ts
export class GreetingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GreetingError";
  }
}
```

A **class** is a blueprint for objects. `extends Error` means this class builds on the built-in `Error` class and gets its behavior (a message, a stack trace). The **constructor** is the function that runs when you write `new GreetingError("...")`. `super(message)` calls the parent class's constructor. `this` is the object being built. Setting `name` makes the error print as `GreetingError`, so `instanceof` checks and logs can tell it apart from other errors. The comment above it (`/** ... */`) is a **doc comment** that editors show on hover.

### `src/domain/greeting.ts`: the rules

```ts
import { GreetingError } from "./errors.js";

export const MAX_TITLE_LENGTH = 80;
```

An exported constant: titles are cut at 80 characters. `_` is not used here, but numbers elsewhere (like `30_000`) may contain `_` as a thousands separator for readability.

```ts
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
```

The first line is a comment for ESLint (see `eslint.md`). The second is a **regular expression** (regex): a compact pattern that describes text. Between the slashes: `[...]` is a character class, "any one character from this set"; `\u0000-\u001f` is the range of characters whose codes (written as 4 hexadecimal digits after `\u`) run from 0 to 31, the **control characters** (line breaks, tab, escape, and others that are not letters); `\u007f-\u009f` is a second range of control characters. The trailing `g` flag means "global": find all matches, not only the first.

```ts
export interface Greeting {
  readonly author: string;
  readonly title: string;
}
```

The shape of a greeting: who and what, neither changeable.

```ts
export function sanitizeTitle(raw: string): string {
  const printable = raw.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
  return printable.length > MAX_TITLE_LENGTH ? `${printable.slice(0, MAX_TITLE_LENGTH - 1)}…` : printable;
}
```

`raw.replace(pattern, " ")` returns a new text where every match is replaced by one space (text values are never changed in place). The second `replace` uses `/\s+/g`: `\s` means "any whitespace character" and `+` means "one or more in a row", so runs of spaces, tabs and line breaks collapse into a single space. `.trim()` removes spaces at the start and end. The last line is a **conditional expression** `condition ? a : b`: if the text is longer than 80, take the first 79 characters (`slice(0, 79)`) and append `…`; otherwise return it unchanged. The result is one printable line of at most 80 characters. Note what this function does **not** remove: quotes, semicolons, dollar signs. They are only text and are only ever printed. The protection against shell injection is the `env:` indirection in the workflow (see `github-actions.md`), and a unit test states that explicitly.

```ts
export function createGreeting(author: string, rawTitle: string): Greeting {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(author)) {
    throw new GreetingError(`not a valid author login: ${JSON.stringify(author.slice(0, 40))}`);
  }
  const title = sanitizeTitle(rawTitle);
  if (title === "") {
    throw new GreetingError("the issue title is empty");
  }
  return { author, title };
}
```

The regex: `^` is the start of the text and `$` the end, so the whole text must match. `[A-Za-z0-9]` is one letter or digit. `(?:...)` groups without capturing. `[A-Za-z0-9-]{0,38}` is zero to 38 letters, digits or hyphens. In total: a GitHub username (letter or digit first, then up to 38 more letters, digits, hyphens). `.test(author)` returns true or false. `!` negates. If the author is not valid, throw a `GreetingError`; the message shows at most the first 40 characters of the author, quoted by `JSON.stringify` (which also escapes odd characters so they cannot disturb a log). An empty title after sanitizing is also an error. `return { author, title }` builds an object using the **shorthand** where `{ author }` means `{ author: author }`.

```ts
export function renderGreeting(greeting: Greeting): string {
  return `New issue from ${greeting.author}: ${greeting.title}`;
}
```

Produces the line printed to the log.

### `src/application/greet-issue.ts`: the use case

```ts
import { createGreeting, renderGreeting } from "../domain/greeting.js";

export interface Notifier {
  notify(line: string): void;
}

export class GreetIssue {
  constructor(private readonly notifier: Notifier) {}

  run(author: string, rawTitle: string): void {
    this.notifier.notify(renderGreeting(createGreeting(author, rawTitle)));
  }
}
```

`Notifier` is an interface with one method: "something that can be told a line". `void` means the method returns nothing. In the class, `constructor(private readonly notifier: Notifier) {}` is TypeScript shorthand: a constructor parameter marked `private readonly` becomes a field of the same name, stored automatically. The empty `{}` is the constructor's body. `run` builds a greeting (which may throw) and hands the rendered line to whatever notifier was supplied. The class does not know where the line goes; that is why it is called an **application** layer: it states what should happen, not how.

### `src/infrastructure/stream-notifier.ts`

```ts
import type { Notifier } from "../application/greet-issue.js";

export class StreamNotifier implements Notifier {
  constructor(private readonly stream: { write(chunk: string): unknown }) {}

  notify(line: string): void {
    this.stream.write(`${line}\n`);
  }
}
```

`import type` imports a type with nothing left at run time. `implements Notifier` promises the class has the methods the interface lists, and the compiler checks it. `notify` writes the line followed by a line break to any stream. This is the one place that touches the outside world.

### `pipeline/build-result.ts`: validating data from an untrusted job

```ts
export const CONCLUSIONS = ["success", "failure", "cancelled"] as const;
export type Conclusion = (typeof CONCLUSIONS)[number];
```

`as const` freezes the list and makes its type the exact tuple of three texts. `typeof CONCLUSIONS` is "the type of that constant"; `[number]` means "the type of any element". So `Conclusion` is `"success" | "failure" | "cancelled"`.

```ts
export interface BuildResult {
  readonly pr: number;
  readonly sha: string;
  readonly conclusion: Conclusion;
}

export class InvalidResultError extends Error { ... }   // same pattern as GreetingError
const MAX_PR_NUMBER = 10_000_000;
```

The three fields of the result file. `InvalidResultError` is built exactly like `GreetingError`. `10_000_000` is ten million (underscores are only for reading).

```ts
export function parseResult(text: string): BuildResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new InvalidResultError("the result is not JSON");
  }
```

`let` declares a variable that may be assigned again (unlike `const`). `JSON.parse` turns JSON text into a value (see `json.md`) or throws if the text is not valid JSON. `data` has the type `unknown`: nothing can be done with it until it is checked. `catch {` without a name ignores the thrown error object, because we replace it with our own message.

```ts
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new InvalidResultError("the result is not an object");
  }
  const record = data as Record<string, unknown>;
```

`typeof data` gives the kind of a value as text (`"object"`, `"string"`, `"number"`...). In JavaScript `null` and arrays are also "objects", so they are excluded explicitly with `data === null` and `Array.isArray(data)`. After these checks it is safe to say `data as Record<string, unknown>`: an object with text keys and unknown values.

```ts
  const unexpected = Object.keys(record).filter((key) => !["pr", "sha", "conclusion"].includes(key));
  if (unexpected.length > 0) {
    throw new InvalidResultError(
      `unexpected field(s): ${unexpected.map((key) => JSON.stringify(key.slice(0, 20))).join(", ")}`,
    );
  }
```

`Object.keys(record)` is the list of the object's field names. `.filter(fn)` keeps the names for which `fn` returns true. `(key) => ...` is an **arrow function**: a short function with the parameter `key`. `.includes(key)` asks whether the list contains it. Any field other than the three is rejected, and the message shows each stray name cut to 20 characters and quoted. `.map(fn).join(", ")` turns the list into one text with commas.

```ts
  const { pr, sha, conclusion } = record;
  if (typeof pr !== "number" || !Number.isInteger(pr) || pr < 1 || pr > MAX_PR_NUMBER) {
    throw new InvalidResultError("pr must be a positive integer");
  }
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new InvalidResultError("sha must be 40 lowercase hexadecimal characters");
  }
  if (typeof conclusion !== "string" || !(CONCLUSIONS as readonly string[]).includes(conclusion)) {
    throw new InvalidResultError(`conclusion must be one of ${CONCLUSIONS.join(", ")}`);
  }
  return { pr, sha, conclusion: conclusion as Conclusion };
}
```

The three fields are checked one by one. `pr`: must be a number, a whole number (`Number.isInteger`), at least 1, at most ten million. `sha`: must be text that is exactly 40 characters from `0-9a-f` (`{40}` means exactly 40). `conclusion`: must be text and one of the three words (the cast `as readonly string[]` is needed only so `.includes` accepts any text). Only after all checks does the function return a typed object; the final `as Conclusion` is justified because the check just proved it. Why so strict: the file comes from a job that ran a stranger's code, so every value is hostile until proven otherwise, and each accepted value is only ever put in a URL path, a comment or a log.

```ts
export const COMMENT_MARKER = "<!-- pr-report -->";

export function renderComment(result: BuildResult): string {
  const verdict = { success: "passed", failure: "failed", cancelled: "was cancelled" }[result.conclusion];
  return `${COMMENT_MARKER}\nThe build of \`${result.sha.slice(0, 7)}\` ${verdict}.`;
}
```

`COMMENT_MARKER` is an HTML comment (invisible when Markdown is displayed) used to recognize our own comment later. `renderComment` looks the conclusion up in a small object to pick the wording, then returns two lines: the marker, and "The build of `0123456` passed." (the first 7 characters of the commit hash; `\`` writes a literal backtick inside a template literal).

### `pipeline/github-comments.ts`: calling GitHub's web API

```ts
export interface Comments {
  list(repository: string, pr: number): Promise<{ id: number; body: string }[]>;
  create(repository: string, pr: number, body: string): Promise<void>;
  update(repository: string, commentId: number, body: string): Promise<void>;
}
```

The three operations the tool needs, as an interface so tests can replace the real service. A **`Promise<T>`** stands for a result that will arrive later (network calls take time). `Promise<void>` is a later result with no value. Functions that return promises are used with `await`.

```ts
export async function upsertComment(api: Comments, repository: string, pr: number, body: string): Promise<"created" | "updated"> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`not a repository name: ${JSON.stringify(repository.slice(0, 80))}`);
  }
  const existing = (await api.list(repository, pr)).find((comment) => comment.body.startsWith(COMMENT_MARKER));
  if (existing) {
    await api.update(repository, existing.id, body);
    return "updated";
  }
  await api.create(repository, pr, body);
  return "created";
}
```

`async function` marks a function that uses `await` and returns a promise. `await x` pauses this function until the promise `x` has its result, without freezing the rest of the program. First the repository name is checked against `owner/name` (letters, digits, `_`, `.`, `-`, one `/`), because it is about to become part of a web address; `\/` is a literal slash inside the regex. Then it lists the comments, `.find(fn)` returns the first comment whose text starts with the marker (or `undefined`). "Upsert" means update-or-insert: if our comment exists, edit it; otherwise create it. Re-running the workflow therefore never piles up comments.

```ts
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}
```

An error that carries the web server's **status code**: a three-digit number in every answer (200 success, 404 not found, 500 server problem). `readonly status` in the constructor parameters stores it as a field.

```ts
export interface HttpOptions {
  readonly token: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
  readonly attempts?: number;
  readonly timeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}
```

The settings of the client. The `?` after a name makes it optional. `typeof fetch` is "the same type as the built-in `fetch` function", so tests can pass a fake. `(ms: number) => Promise<void>` is a function type: takes a number, returns a promise.

```ts
export class GitHubComments implements Comments {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly attempts: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.github.com";
    this.fetchFn = options.fetchFn ?? fetch;
    this.attempts = options.attempts ?? 3;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }
```

`??` is the **nullish coalescing** operator: use the right side when the left is missing. So defaults are: GitHub's address, the real `fetch`, three attempts, a 10-second timeout (10 000 milliseconds), and a real sleep made from `setTimeout` (call a function after some milliseconds) wrapped in a promise. `private` fields are visible only inside the class.

```ts
  async list(repository: string, pr: number) {
    const response = await this.request("GET", `/repos/${repository}/issues/${pr}/comments?per_page=100`);
    return (await response.json()) as { id: number; body: string }[];
  }
  async create(repository: string, pr: number, body: string): Promise<void> {
    await this.request("POST", `/repos/${repository}/issues/${pr}/comments`, { body });
  }
  async update(repository: string, commentId: number, body: string): Promise<void> {
    await this.request("PATCH", `/repos/${repository}/issues/comments/${commentId}`, { body });
  }
```

Three web calls. GET reads; POST creates; PATCH changes part of something (see `github-rest-api.md`). `response.json()` reads the answer body and parses it. `{ body }` is shorthand for `{ body: body }`.

```ts
  private async request(method: string, path: string, payload?: unknown): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      try {
        const init: RequestInit = {
          method,
          headers: {
            Authorization: `Bearer ${this.options.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
          },
          signal: AbortSignal.timeout(this.timeoutMs),
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        };
        const response = await this.fetchFn(`${this.baseUrl}${path}`, init);
        if (response.ok) return response;
        throw new HttpError(response.status, `GitHub answered ${response.status} to ${method} ${path}`);
      } catch (error) {
        if (error instanceof HttpError && error.status < 500) throw error;
        lastError = error;
      }
      if (attempt < this.attempts) await this.sleep(2 ** (attempt - 1) * 500);
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
```

Line by line: the `for` loop counts `attempt` from 1 to `attempts`. `RequestInit` is the built-in type for the options of `fetch`. `headers` are extra lines of information sent with a web request: `Authorization: Bearer TOKEN` proves who is asking; `Accept` says which answer format is wanted; `X-GitHub-Api-Version` pins the API behavior to a dated version. The `...( cond ? {} : {...} )` is the **spread** operator: it copies the fields of an object into this one, so the `Content-Type` header and the `body` exist only when there is a payload. `AbortSignal.timeout(ms)` makes a signal that cancels the request after the time. `response.ok` is true for status codes 200 to 299. Otherwise throw an `HttpError`. In the `catch`: a status below 500 (a 4xx, meaning our request is wrong) is thrown immediately, because retrying cannot help; anything else (a network failure, a timeout, a 5xx) is remembered and the loop continues after waiting `2 ** (attempt - 1) * 500` milliseconds (`**` is "to the power of": 500 ms, then 1000 ms). After the last attempt, the last error is thrown. The error message names the method and path but never the token.

### `pipeline/post-result-cli.ts`

```ts
import { readFileSync } from "node:fs";
import { InvalidResultError, parseResult, renderComment } from "./build-result.js";
import { GitHubComments, upsertComment } from "./github-comments.js";

const [file] = process.argv.slice(2);
const token = process.env["GITHUB_TOKEN"];
const repository = process.env["GITHUB_REPOSITORY"];
```

`process.argv` is the list of command-line words; the first two are Node and the script, so `.slice(2)` keeps the arguments. `const [file] = ...` is array destructuring: take the first item. Environment variables are read with brackets because the compiler setting `noUncheckedIndexedAccess` needs the name written as text.

```ts
if (!file || !token || !repository) {
  console.error("usage: GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name post-result-cli.ts RESULT.json");
  process.exit(2);
}
```

If any is missing, print the usage text to standard error and stop at once with exit code 2.

```ts
try {
  const result = parseResult(readFileSync(file, "utf8"));
  const action = await upsertComment(new GitHubComments({ token }), repository, result.pr, renderComment(result));
  console.log(`pr-report: ${action} the comment on pull request ${result.pr} (${result.conclusion})`);
} catch (error) {
  if (error instanceof InvalidResultError) {
    console.error(`pr-report: refusing the result: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
```

Read the file as text (`"utf8"` is the character encoding), validate it, post or update the comment, print what happened. The `await` at the top level (outside any function) is allowed in ES modules. A bad result file ends with exit code 1 and a clear message; other errors propagate and fail the step too.

### `pipeline/trust-policy.ts`: modeling AWS's login check

This file is a small re-implementation of how AWS reads the trust policy (see `aws-iam.md` and `oidc.md` for what that policy is). It exists so a test can say, without an AWS account, which logins the real policy would accept.

```ts
export interface Token { readonly aud: string; readonly sub: string; }
type ConditionBlock = Record<string, Record<string, string | string[]>>;
export interface Statement {
  readonly Effect: string;
  readonly Action: string | string[];
  readonly Principal: { Federated?: string | string[] };
  readonly Condition?: ConditionBlock;
}
export interface TrustPolicy { readonly Statement: Statement[]; }
export interface Decision { readonly allowed: boolean; readonly reason: string; }
```

Shapes: a login token has an audience (`aud`, who it is for) and a subject (`sub`, who is asking). A policy statement has an effect, an action, a principal, and optional conditions: an object of operator names, each holding an object of key to expected value(s). `Decision` is the answer with a reason.

```ts
export function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
```

AWS's `StringLike` operator treats `*` as "any run of characters" and `?` as "any one character". This function turns such a pattern into a regular expression. First, every character that is special in regular expressions (`. + ^ $ { } ( ) | [ ] \`) is protected by a backslash (`"\\$&"` means a backslash followed by whatever matched, `$&`). Then `*` becomes `.*` (`.` is any character, `*` is "zero or more") and `?` becomes `.`. `new RegExp(text)` builds the pattern from text, with `^...$` anchors so the whole value must match.

```ts
const asList = (value: string | string[]): string[] => (Array.isArray(value) ? value : [value]);

function conditionHolds(operator: string, expected: string[], actual: string): boolean {
  switch (operator) {
    case "StringEquals":
      return expected.includes(actual);
    case "StringLike":
      return expected.some((pattern) => likeToRegExp(pattern).test(actual));
    default:
      return false;
  }
}
```

`asList` makes a single value into a one-item list. `switch` chooses a branch by the operator name: `StringEquals` is true if the actual value is exactly one of the expected ones; `StringLike` is true if it matches any pattern (`.some(fn)` is true if the function is true for at least one item). Any other operator returns `false`: the model **fails closed**, meaning that whatever it does not understand counts as "not allowed".

```ts
export function evaluate(policy: TrustPolicy, token: Token, host: string, providerArn: string): Decision {
  let lastReason = "no statement allows sts:AssumeRoleWithWebIdentity";
  for (const statement of policy.Statement) {
    if (statement.Effect !== "Allow") continue;
    if (!asList(statement.Action).includes("sts:AssumeRoleWithWebIdentity")) continue;
    if (!asList(statement.Principal.Federated ?? []).includes(providerArn)) {
      lastReason = "the token comes from a different identity provider";
      continue;
    }
    const claims: Record<string, string> = { [`${host}:aud`]: token.aud, [`${host}:sub`]: token.sub };
    let failed: string | undefined;
    for (const [operator, keys] of Object.entries(statement.Condition ?? {})) {
      for (const [key, value] of Object.entries(keys)) {
        const actual = claims[key];
        if (actual === undefined || !conditionHolds(operator, asList(value), actual)) {
          failed = `${key} ${actual === undefined ? "is not a claim" : `"${actual}"`} fails ${operator} ${JSON.stringify(value)}`;
        }
      }
    }
    if (failed === undefined) return { allowed: true, reason: "every condition holds" };
    lastReason = failed;
  }
  return { allowed: false, reason: lastReason };
}
```

For each statement: skip it unless it is an `Allow` for the action `sts:AssumeRoleWithWebIdentity` and names the right identity provider. `continue` skips to the next item of the loop. Then the claims of the token are put in an object under the same keys AWS uses (`token.actions.githubusercontent.com:aud` and `:sub`; the square brackets `[...]` around a template literal make a computed key). `Object.entries(x)` gives a list of `[key, value]` pairs, and `for (const [a, b] of list)` loops over them. Every condition must hold; if one fails, the reason text is remembered. If none failed, the answer is "allowed". If no statement allowed it, the answer is "refused" with the last reason.

```ts
export function scenarios(repository: string, environment: string): Scenario[] { ... }
```

Returns eight sample tokens with the answer the policy should give, in this order: the approved deploy job in the environment (allowed); the same repository on a feature branch; on `main` with no environment; a pull request; another environment; a fork's pull request (`repo:someone-else/<name>:pull_request`); another repository with the same environment name (`<repository>-other`); and the right subject with a wrong audience (`sts.example.invalid`). Only the first is allowed. `repository.split("/")[1] ?? "repo"` takes the part after the slash, with a fallback because of `noUncheckedIndexedAccess`.

### `pipeline/check-trust-cli.ts`

It reads the JSON plan that Terraform produced (see `terraform.md`), finds the planned `aws_iam_role` and its `assume_role_policy`, and runs `evaluate` on each scenario:

```ts
function* resourcesOf(module: Module): Generator<PlannedResource> {
  yield* module.resources ?? [];
  for (const child of module.child_modules ?? []) yield* resourcesOf(child);
}
```

`function*` declares a **generator**: a function that produces its results one at a time with `yield`. `yield*` hands over every item of another list or generator. This one produces every resource of a module and, recursively, of its child modules (a Terraform plan nests modules inside modules). `[...resourcesOf(...)]` collects them in a list.

```ts
const role = resources.find((resource) => resource.type === "aws_iam_role");
const provider = resources.find((resource) => resource.type === "aws_iam_openid_connect_provider");
const policy = JSON.parse(role.values.assume_role_policy) as TrustPolicy;
```

The policy is JSON text stored inside the plan's JSON, so it is parsed a second time. Then each scenario is run, one line is printed (`ok` or `FAIL`, `ASSUMED` or `REFUSED`, the name, the subject, the reason), mismatches are counted, and the exit code is 0 only if all eight matched. Missing pieces end with exit code 2 (a different, "cannot even check" kind of failure).

### `pipeline/harden-lint.ts`: the workflow linter

A linter reads files and reports problems without running them. This one reads GitHub workflow files (YAML, using the `yaml` package, see `yaml-library.md`) and applies eight rules.

```ts
export const RULES = {
  "script-injection": "an event field reaches a shell script through an expression (lab attack 1: greet.yml)",
  "privileged-checkout": "...",
  "missing-permissions": "...",
  "broad-permissions": "...",
  "unpinned-action": "...",
  "persist-credentials": "...",
  "stored-cloud-key": "...",
  "oidc-without-environment": "...",
} as const;
export type RuleId = keyof typeof RULES;
```

An object from rule name to description; `keyof typeof RULES` is "the union of the object's keys", so a rule id can only be one of these eight.

```ts
const EXPRESSION = /\$\{\{([\s\S]*?)\}\}/g;
```

Matches `${{ ... }}`: `\$\{\{` is the literal characters (each escaped), `([\s\S]*?)` captures anything (including line breaks; `[\s\S]` means any character, `*?` means "as few as possible"), `\}\}` closes it.

```ts
const SAFE_EVENT_FIELD = /^github\.event\.(number|pull_request\.number|issue\.number|workflow_run\.id|workflow_run\.run_id)$/;
const EVENT_REFERENCE = /github\.event\.[A-Za-z0-9_.*'-]+|github\.head_ref|github\.ref_name/g;
const PR_HEAD = /github\.event\.pull_request\.head|github\.head_ref|github\.event\.workflow_run\.head|refs\/pull\//;
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const CLOUD_KEY = /secrets\.(AWS_[A-Z0-9_]*(KEY|TOKEN)[A-Z0-9_]*|[A-Z0-9_]*(CREDENTIALS|SA_KEY|SERVICE_ACCOUNT_KEY)[A-Z0-9_]*|AZURE_CLIENT_SECRET|DEPLOY_TOKEN)\b/;
const PRIVILEGED_TRIGGERS = ["pull_request_target", "workflow_run"];
```

`SAFE_EVENT_FIELD`: the few event fields that are numbers GitHub makes (an issue number, a run id), which no stranger can fill with text. `EVENT_REFERENCE`: any `github.event.<something>`, `github.head_ref` (the name of the branch of a pull request, chosen by its author) or `github.ref_name`. `PR_HEAD`: references to the pull request's own commit or branch. `PINNED`: `owner/name@` followed by exactly 40 hex characters. `CLOUD_KEY`: secret names that look like long-lived cloud credentials. `\w` means "a letter, digit or underscore"; `\b` is a word boundary.

```ts
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
```

A type that describes anything JSON can contain; it refers to itself (`Json[]`), which TypeScript allows.

`asMapping` and `asList` return an empty object or list when the value is not of that kind, so that the rest of the code never crashes on an odd workflow file. `triggersOf(on)` returns the event names whether `on:` is written as one word, a list or a map. `untrustedReferences(text)` loops over every `${{ ... }}` (`text.matchAll(EXPRESSION)`), looks inside for event references, and returns those that are not in the safe list.

`lintWorkflow(file, text)` is the main function. It parses the YAML to both a plain data object and a tree with line positions (`LineCounter`, see `yaml-library.md`), defines a helper `report(rule, severity, path, job, message)` that records a finding with its line number, then runs the rules:

1. If the top-level `permissions` is the text `write-all`: error `broad-permissions`. If it contains any `write` value: warning (write rights granted to every job).
2. For each job: if neither the workflow nor the job has `permissions`: error `missing-permissions`. If the job has `write-all`: error. If the job has `id-token: write` without an `environment`: warning `oidc-without-environment`. If the job's `env` contains a cloud-key-like secret: error `stored-cloud-key`.
3. For each step (or the single `uses` of a job that calls a reusable workflow): if `uses` is not local (`./`), not a `docker://` image, and not matched by `PINNED`: error `unpinned-action`. For the `run` text and for the `with.script` text (used by `actions/github-script`): any untrusted reference gives error `script-injection`.
4. For a `uses` that starts with `actions/checkout`: if the workflow has a privileged trigger and `ref` or `repository` points at the pull request: error `privileged-checkout`. If `persist-credentials` is not `false`: `persist-credentials` (error under a privileged trigger, otherwise a warning).
5. If any step's JSON text matches the cloud-key pattern: error `stored-cloud-key`.

`lintPaths(paths)` accepts files and folders (a folder means every `.yml`/`.yaml` file in it, sorted) and concatenates the findings with `flatMap` (map each item to a list and join the lists). `formatFinding` prints `file:line: severity [rule] message (job NAME)`.

### `pipeline/harden-lint-cli.ts`

```ts
const args = process.argv.slice(2);
const paths = args.filter((arg) => !arg.startsWith("--"));
if (args.includes("--rules")) {
  for (const [id, description] of Object.entries(RULES)) console.log(`${id}\t${description}`);
  process.exit(0);
}
const findings = lintPaths(paths.length > 0 ? paths : [".github/workflows"]);
for (const finding of findings) console.log(formatFinding(finding));
const errors = findings.filter((finding) => finding.severity === "error").length;
console.log(`harden-lint: ${errors} error(s), ${findings.length - errors} warning(s)`);
process.exit(findings.length > 0 ? 1 : 0);
```

Arguments starting with `--` are options, the rest are paths (default: the repository's own workflows). `--rules` prints the eight rule ids and descriptions separated by a tab character (`\t`) and exits. Otherwise print each finding, then a summary line, and exit 1 if there was any finding, warnings included.

## Try it yourself

1. `npx tsc --version` prints `Version 6.0.3`.
2. `npx tsc -p tsconfig.json --noEmit; echo $?` prints `0` and nothing else: the types are fine and no file is written.
3. `npm run build`, then `ISSUE_AUTHOR=octocat ISSUE_TITLE='Build fails on Windows' node dist/main.js` prints `New issue from octocat: Build fails on Windows`. (`dist/` is ignored by Git; `rm -rf dist` removes it.)
4. `ISSUE_AUTHOR=octocat ISSUE_TITLE='x"; echo INJECTED; echo "' node dist/main.js` prints the odd title as one line of text. Nothing is run.
5. `ISSUE_AUTHOR='$(id)' ISSUE_TITLE=x node dist/main.js; echo $?` prints `greeter: not a valid author login: "$(id)"` and then `1`.

## Mistakes people make

- Believing types protect against bad data at run time. They do not; check data from outside, as `parseResult` does.
- Using `any` to make an error go away; `unknown` plus a check is safer.
- Forgetting `.js` in relative imports when using `NodeNext`.
- Importing something that is only a type without `import type` when `verbatimModuleSyntax` is on.
- Sanitizing text and then trusting it in a shell. Clean input helps; keeping data out of code is the real fix.
- Using `as` to silence the compiler where nothing has checked the value.

## Check yourself

1. What happens to the types when the program runs? *(They are removed; Node runs plain JavaScript.)*
2. Why does `JSON.parse` give `unknown` here and what makes the value safe to use? *(The compiler cannot know the file's contents; `parseResult` checks every field before returning a typed object.)*
3. Why does the code write `policy.Statement[0]?.Principal`? *(`noUncheckedIndexedAccess` says the list might be empty, so the item may be `undefined`.)*
4. Why are relative imports written `./x.js` in `.ts` files? *(`NodeNext` follows Node's rules, in which the compiled file is `x.js`.)*
5. Why is a 4xx answer not retried but a 5xx is? *(4xx means our request is wrong, so resending changes nothing; 5xx may be a temporary server problem.)*

## Further reading

- TypeScript handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- tsconfig reference (every option used above): https://www.typescriptlang.org/tsconfig/
- TypeScript release notes: https://devblogs.microsoft.com/typescript/
