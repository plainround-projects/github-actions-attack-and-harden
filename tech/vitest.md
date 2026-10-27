# Vitest (with @vitest/coverage-v8 and Vite)

## What it is

A **test** is a small program that uses your code and checks that the answer is the one you expected. Without tests, the only way to know that a change did not break something is to try everything by hand. A **test runner** is a program that finds all the tests, runs them, and prints which passed and which failed. It also sets the exit code of the command to 0 when everything passed and to a non-zero number otherwise, which is how a build system learns whether to continue.

**Vitest** is the test runner used here, for JavaScript and TypeScript. It is built on **Vite**, a tool that can read TypeScript files directly (it removes the types in memory, so the tests need no separate compile step).

A test is written as a function with a name:

```ts
it("keeps an ordinary title as it is", () => {
  expect(sanitizeTitle("Build fails on Windows")).toBe("Build fails on Windows");
});
```

- `it(name, function)` declares one test. (`test` is a synonym.)
- `describe(name, function)` groups tests under a heading.
- `expect(actual)` starts an **assertion**; `.toBe(expected)` finishes it. If the two differ, an error is thrown, and a thrown error is what makes a test fail.
- `() => { ... }` is an **arrow function**: a function written without a name. `async () => { ... }` is the same for code that waits for results (see `typescript.md`).

**Coverage** answers "which lines of my code did the tests actually run?". The package `@vitest/coverage-v8` uses counters built into V8, the JavaScript engine inside Node.js, to record which pieces of code ran, and then reports percentages.

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **shell**: The program inside a terminal that reads what you type and starts other programs. Bash is a shell.
- **pipe**: The `|` symbol between two commands: the output of the first becomes the input of the second.
- **hash**: A fixed-length fingerprint computed from some data. The same data always gives the same hash; any change gives a different one. SHA-256 and SHA-1 are two ways of computing one.
- **SHA**: A family of hash functions. A Git **commit SHA** is a 40-character hexadecimal fingerprint that names one exact commit.
- **commit**: A saved snapshot of a project's files in Git, with a message and an author. Every commit has a unique 40-character name (its SHA).
- **branch**: A movable name for a line of commits in Git. `main` is the usual name of the primary line.
- **fork**: Your own copy of someone else's repository on GitHub. Strangers propose changes by changing their fork and opening a pull request from it.
- **repository**: A project's folder of files together with its complete history of changes. On GitHub, a repository is a page with those files, issues and pull requests.
- **workflow**: A GitHub Actions automation described in a YAML file under `.github/workflows/`. It names the events that start it and the jobs it runs.
- **secret**: A value such as a password stored in a repository's settings. Workflows can read it, but GitHub hides it in logs.
- **CI**: Continuous integration: running checks (build, tests, linters) automatically every time code changes.
- **HTTP**: The protocol (agreed rules) that web browsers and servers use to talk. A request names a **method** (`GET` to read, `POST` to create, `PATCH` to change part, `PUT` to replace, `DELETE` to remove) and an address; the answer carries a **status code** (200 means success, 404 not found, 500 server problem).
- **URL**: A web address such as `https://api.github.com/zen`.
- **JSON**: A plain-text format for structured data: objects `{ "name": "value" }`, lists `[1, 2]`, texts in double quotes, numbers, `true`, `false`, `null`. It has no comments.
- **package**: A bundle of code someone published for others to use, installed by a package manager such as npm or pip.
- **module**: A file, or a folder of files, that other code can load and use. In Terraform, a module is a folder of configuration used like a function.
- **function**: A named piece of code that takes inputs (parameters), does something, and may return a result.
- **class**: A blueprint for objects: it bundles data and the functions that work on it. `new Name(...)` or `Name(...)` makes an object from it.
- **interface**: A description of the shape something must have: which fields and methods. Code that depends only on the interface can accept any object of that shape.
- **array**: An ordered list of values.
- **string**: A piece of text in a program.
- **file path**: The written address of a file, such as `src/main.ts`; folders are separated by `/`.
- **linter**: A program that reads code without running it and reports likely mistakes or rule breaks.
- **compiler**: A program that translates code written in one language into another form, and checks it on the way.
- **assert**: A statement that checks something is true and fails loudly if it is not.
- **Terraform**: A tool that creates cloud resources from files that describe them.

</details>

<!-- /words -->

## Why this repository uses it

Security tooling that is wrong is worse than none, so the parts that decide things (the workflow linter, the result validator, the trust-policy model) are tested hard: 90 tests in 10 files, with a coverage minimum that fails the build if it drops. Vitest also runs the end-to-end test that starts the real program as a separate process.

## Where it appears

| Path | What it does |
| --- | --- |
| `vitest.config.ts` | Where tests live, the time limit, the coverage rules. |
| `tests/unit/greeting.test.ts` | Tests of the rules in `src/domain/greeting.ts`. |
| `tests/unit/greet-issue.test.ts` | Tests of the use case with a recording notifier. |
| `tests/unit/cli.test.ts` | Tests of `main` with fake input and output. |
| `tests/integration/stream-notifier.test.ts` | The notifier against a real Node stream. |
| `tests/e2e/greeter-process.test.ts` | Compiles the program and runs it as a child process. |
| `tests/pipeline/build-result.test.ts` | The result-file validator and the comment text. |
| `tests/pipeline/github-comments.test.ts` | The comment poster, with a scripted fake web service. |
| `tests/pipeline/harden-lint.test.ts` | The workflow linter, rule by rule, and on the lab files. |
| `tests/pipeline/trust-policy.test.ts` | The model of AWS's login check. |
| `tests/pipeline/checklist.test.ts` | Checks that the review checklist document agrees with the linter. |
| `package.json`, `Makefile`, `ci.yml`, `pr-build.yml` | Run `vitest run --coverage` through `npm test` and `make test`. |

## How it works underneath

1. `vitest run` starts a Node process (a **process** is a running program with its own memory). It reads `vitest.config.ts` and finds files that match `include`.
2. It runs each test file in its own **worker** (a separate thread of execution), so files cannot disturb each other. Files run at the same time; the tests inside one file run one after another.
3. Vite converts each TypeScript file to JavaScript in memory. It does **not** check types; that is `tsc`'s job (`npm run typecheck`).
4. Every `it` function runs. A thrown error, including a failed `expect`, marks it failed. A test that finishes without throwing passes.
5. With coverage on, V8 records which ranges of code ran. The `v8` provider turns this into per-file percentages of **statements** (individual instructions), **branches** (each side of an `if`, `?:`, `&&`, `||`), **functions**, and **lines**.
6. If any percentage is below its threshold, the command exits non-zero even though every test passed.

`vitest run` means "run once and exit". Plain `vitest` stays open and re-runs on every file change (**watch mode**), which is wrong for CI.

## Walkthrough of this repository's use

### `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The end-to-end test starts a Node process; on a busy laptop or a shared runner that can take longer than 5 s.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "pipeline/**/*.ts"],
      exclude: ["src/main.ts", "pipeline/*-cli.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 },
    },
  },
});
```

- `defineConfig` only helps the editor understand the shape; it returns what it is given. `export default` makes the object the file's main export, which is what Vitest looks for.
- `include`: a **glob** (a pattern with wildcards) of test files. `**` means "any number of folders"; `*` means "any characters in one name". So: every file ending `.test.ts` below `tests/`.
- `testTimeout: 30_000`: a test fails if it runs longer than 30 000 milliseconds. The default is 5 seconds. The end-to-end test compiles TypeScript and starts a process, which can be slow on a busy computer. The underscore in the number is only for reading.
- `coverage.provider: "v8"`: use the counters in V8.
- `coverage.include`: measure only code under `src/` and `pipeline/`.
- `coverage.exclude`: leave out `src/main.ts` and the `*-cli.ts` command-line wrappers. They are thin, and the end-to-end test exercises them in another process, which coverage cannot see inside.
- `reporter: ["text", "lcov"]`: print a table to the screen, and also write `coverage/lcov.info`, a standard file format that other tools can read.
- `thresholds`: the minimum percentages. Lines, functions and statements 95; branches 90. At the time of writing the totals were 100 percent lines, 99.04 percent statements, 95.74 percent functions and 94.26 percent branches.

<!-- walk:tests/unit/greeting.test.ts -->
### `tests/unit/greeting.test.ts`, line by line

Lines 1 to 3:

```ts
import { describe, expect, it } from "vitest";
import { GreetingError } from "../../src/domain/errors.js";
import { MAX_TITLE_LENGTH, createGreeting, renderGreeting, sanitizeTitle } from "../../src/domain/greeting.js";
```

Three imports. `import { a, b } from "x"` loads the named things `a` and `b` from another file or package. `describe`, `expect` and `it` come from Vitest. `GreetingError` is the error class of the domain. The second `import` brings in the four functions under test, which are exported by `src/domain/greeting.ts`. The `.js` ending is the Node module rule explained in `typescript.md`.

Lines 5 to 23:

```ts
describe("sanitizeTitle", () => {
  it("keeps an ordinary title as it is", () => {
    expect(sanitizeTitle("Build fails on Windows")).toBe("Build fails on Windows");
  });

  it("turns line breaks and control characters into single spaces", () => {
    expect(sanitizeTitle("one\r\ntwo\u0000\u001b[31mthree")).toBe("one two [31mthree");
  });

  it("leaves shell metacharacters alone because they are only ever printed", () => {
    expect(sanitizeTitle('x"; echo hi; echo "')).toBe('x"; echo hi; echo "');
  });

  it("cuts a long title with an ellipsis at the limit", () => {
    const cut = sanitizeTitle("a".repeat(500));
    expect(cut).toHaveLength(MAX_TITLE_LENGTH);
    expect(cut.endsWith("…")).toBe(true);
  });
});
```

The first group, `sanitizeTitle`. Four tests. (1) An ordinary title comes back unchanged. (2) The input `"one\r\ntwo\u0000\u001b[31mthree"` contains a carriage return and a line feed (`\r\n`, the Windows line ending), a null character (`\u0000`) and an escape character (`\u001b`, which terminals use to start colours). A **string escape** such as `\u001b` is a way to write a character by its code. The expected result `"one two [31mthree"` shows every control character became one space, runs of spaces collapsed, and the visible text `[31m` stayed. (3) Quotes and semicolons are **not** changed, because they are harmless as printed text; this test documents that the safety does not come from cleaning but from never giving the text to a shell. (4) `"a".repeat(500)` (the letter `a` five hundred times) is cut to exactly `MAX_TITLE_LENGTH` (80) characters and ends with the ellipsis character; `toHaveLength` checks the length and `endsWith` the end.

Lines 25 to 37:

```ts
describe("createGreeting", () => {
  it("builds an immutable greeting from a login and a title", () => {
    expect(createGreeting("octocat", "  Hello  ")).toEqual({ author: "octocat", title: "Hello" });
  });

  it.each(["", "-leading", "has space", "a".repeat(40), "semi;colon", "$(id)"])("rejects the author %j", (author) => {
    expect(() => createGreeting(author, "Hello")).toThrow(GreetingError);
  });

  it("rejects a title that is empty once cleaned", () => {
    expect(() => createGreeting("octocat", " \n\t ")).toThrow(/empty/);
  });
});
```

The group `createGreeting`. (1) `createGreeting("octocat", "  Hello  ")` returns an object whose `author` is `octocat` and whose `title` is `Hello` with the spaces trimmed. `toEqual` compares objects by their contents (`toBe` would compare whether they are the very same object). (2) `it.each(list)(name, function)` runs the same test once for each item of the list; `%j` in the name is replaced by the item written as JSON. The six bad author names are: empty, starts with a hyphen, contains a space, forty characters (one too many), contains a semicolon, and `$(id)` (a shell command substitution). `expect(() => createGreeting(author, "Hello")).toThrow(GreetingError)` wraps the call in a function so that Vitest, not the test, catches the thrown error, then checks it is a `GreetingError`. (3) A title that is only spaces, a line break and a tab is empty after cleaning, and the error message must match the pattern `/empty/` (a regular expression written between slashes).

Lines 39 to 43:

```ts
describe("renderGreeting", () => {
  it("prints the author and the title on one line", () => {
    expect(renderGreeting({ author: "octocat", title: "Hello" })).toBe("New issue from octocat: Hello");
  });
});
```

The group `renderGreeting`: given the object `{ author: "octocat", title: "Hello" }` the returned line is exactly `New issue from octocat: Hello`.

<!-- /walk:tests/unit/greeting.test.ts -->

<!-- walk:tests/unit/greet-issue.test.ts -->
### `tests/unit/greet-issue.test.ts`, line by line

Lines 1 to 3:

```ts
import { describe, expect, it } from "vitest";
import { GreetIssue, type Notifier } from "../../src/application/greet-issue.js";
import { GreetingError } from "../../src/domain/errors.js";
```

Imports. `type Notifier` inside the braces imports a name that is only a type (see `typescript.md`, `verbatimModuleSyntax`). `GreetIssue` is the use case under test.

Lines 5 to 10:

```ts
class RecordingNotifier implements Notifier {
  readonly lines: string[] = [];
  notify(line: string): void {
    this.lines.push(line);
  }
}
```

A **test double**: a small class made only for tests. It implements the `Notifier` interface by saving every line it is told in a list (`readonly lines: string[] = []` is an empty list of texts; `this.lines.push(line)` appends one). Because the use case only knows the `Notifier` interface, this recorder can take the place of the real stream writer.

Lines 12 to 24:

```ts
describe("GreetIssue", () => {
  it("sends one line to the notifier", () => {
    const notifier = new RecordingNotifier();
    new GreetIssue(notifier).run("octocat", "Hello");
    expect(notifier.lines).toEqual(["New issue from octocat: Hello"]);
  });

  it("sends nothing when the issue is unusable", () => {
    const notifier = new RecordingNotifier();
    expect(() => new GreetIssue(notifier).run("not a login", "Hello")).toThrow(GreetingError);
    expect(notifier.lines).toEqual([]);
  });
});
```

Two tests. (1) After `new GreetIssue(notifier).run("octocat", "Hello")` the recorder holds exactly one line, `New issue from octocat: Hello`. (2) With the invalid author `not a login` the call must throw `GreetingError`, and the recorder's list must still be empty, which proves the notifier was never called with a half-built greeting.

<!-- /walk:tests/unit/greet-issue.test.ts -->

<!-- walk:tests/unit/cli.test.ts -->
### `tests/unit/cli.test.ts`, line by line

Lines 1 to 9:

```ts
import { describe, expect, it } from "vitest";
import { main } from "../../src/interfaces/cli.js";

function run(env: Record<string, string | undefined>) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main({ env, stdout: { write: (c) => out.push(c) }, stderr: { write: (c) => err.push(c) } });
  return { code, out: out.join(""), err: err.join("") };
}
```

The helper `run(env)` calls `main` with a fake environment and two fake output streams. Each fake stream is an object with a `write` method that appends to a list (`out.push(c)`). `{ code, out: out.join(""), err: err.join("") }` returns the exit code and the two outputs joined into single texts. Tests can then check all three with one call.

Lines 11 to 33:

```ts
describe("main", () => {
  it("prints the greeting and exits 0", () => {
    const result = run({ ISSUE_AUTHOR: "octocat", ISSUE_TITLE: "Hello" });
    expect(result).toEqual({ code: 0, out: "New issue from octocat: Hello\n", err: "" });
  });

  it("prints a title with a quote and a command as plain text", () => {
    const result = run({ ISSUE_AUTHOR: "octocat", ISSUE_TITLE: 'x"; echo INJECTED; echo "' });
    expect(result.out).toBe('New issue from octocat: x"; echo INJECTED; echo "\n');
  });

  it("exits 2 and names the variables when one is missing", () => {
    const result = run({ ISSUE_AUTHOR: "octocat" });
    expect(result.code).toBe(2);
    expect(result.err).toContain("ISSUE_TITLE");
  });

  it("exits 1 with the reason when the issue is unusable", () => {
    const result = run({ ISSUE_AUTHOR: "bad author", ISSUE_TITLE: "Hello" });
    expect(result.code).toBe(1);
    expect(result.err).toContain("not a valid author login");
  });
});
```

Four tests of `main`. (1) With both variables set, the exit code is 0, standard output is `New issue from octocat: Hello` plus a line break and standard error is empty. (2) A title containing a quote and a command (`x"; echo INJECTED; echo "`) is printed as plain text. (3) With `ISSUE_TITLE` missing the exit code is 2 and the error text mentions `ISSUE_TITLE`; `toContain` checks that a text includes a smaller text. (4) With the author `bad author` (a space is not allowed) the exit code is 1 and the message says `not a valid author login`.

Lines 35 to 45:

```ts
describe("main with a failing output stream", () => {
  it("lets an error that is not a GreetingError escape instead of hiding it", () => {
    const env = { ISSUE_AUTHOR: "octocat", ISSUE_TITLE: "Hello" };
    const broken = {
      write: () => {
        throw new Error("disk full");
      },
    };
    expect(() => main({ env, stdout: broken, stderr: broken })).toThrow("disk full");
  });
});
```

A fifth case. The output stream's `write` method throws `new Error("disk full")`. `main` must **not** swallow this: it only catches `GreetingError`. The test asserts that calling `main` throws an error containing `disk full`. Errors that are not understood are bugs and must stay visible.

<!-- /walk:tests/unit/cli.test.ts -->

<!-- walk:tests/integration/stream-notifier.test.ts -->
### `tests/integration/stream-notifier.test.ts`, line by line

Lines 1 to 4:

```ts
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { GreetIssue } from "../../src/application/greet-issue.js";
import { StreamNotifier } from "../../src/infrastructure/stream-notifier.js";
```

Imports. `PassThrough` is a Node **stream**: an object you can write data into and read it back from, like a pipe. `node:stream` is a built-in module (the `node:` prefix marks built-ins, see `node.md`).

Lines 6 to 22:

```ts
describe("StreamNotifier on a real stream", () => {
  it("writes each notification as one line", () => {
    const stream = new PassThrough();
    const notifier = new StreamNotifier(stream);
    notifier.notify("one");
    notifier.notify("two");
    stream.end();
    expect(stream.read().toString()).toBe("one\ntwo\n");
  });

  it("carries a greeting through the use case to the stream", () => {
    const stream = new PassThrough();
    new GreetIssue(new StreamNotifier(stream)).run("octocat", "Hello");
    stream.end();
    expect(stream.read().toString()).toBe("New issue from octocat: Hello\n");
  });
});
```

An **integration test** uses real parts together instead of fakes. Test 1 writes the two lines `one` and `two` through a real `StreamNotifier` into a real `PassThrough`, closes it with `stream.end()`, and reads everything back with `stream.read().toString()`; the result must be `one\ntwo\n` (each line followed by a line break). Test 2 runs the whole use case (`GreetIssue` plus `StreamNotifier`) into the stream and expects `New issue from octocat: Hello\n`.

<!-- /walk:tests/integration/stream-notifier.test.ts -->

<!-- walk:tests/e2e/greeter-process.test.ts -->
### `tests/e2e/greeter-process.test.ts`, line by line

Lines 1 to 16:

```ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
let outDir = "";

function greeter(env: Record<string, string>) {
  return spawnSync(process.execPath, [join(outDir, "main.js")], {
    env: { PATH: process.env["PATH"] ?? "", ...env },
    encoding: "utf8",
    timeout: 20_000,
  });
}
```

The imports are all built-in Node modules: `spawnSync` (start another program and wait), file helpers (`mkdtempSync` makes a uniquely named temporary folder, `rmSync` deletes, `writeFileSync` writes a file), `tmpdir` (the system's temporary folder), and path helpers (`join` glues path pieces, `resolve` makes an absolute path). `import.meta.dirname` is the folder of this file, so `resolve(import.meta.dirname, "../..")` is the repository root. `greeter(env)` runs `node main.js` from the compiled folder with an environment that contains only `PATH` and the variables the test gives (`...env` copies them in), so no secret from the real environment leaks into the program; `encoding: "utf8"` returns output as text and `timeout: 20_000` kills the program after twenty seconds.

Lines 18 to 35:

```ts
describe("the greeter as a process, the way the workflows run it", () => {
  // The program is compiled the way `npm run build` compiles it, into a temporary folder, and run with plain node.
  // The build script cannot be relied on here: the lab replaces it with the fork's.
  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), "greeter-"));
    const compile = spawnSync(
      process.execPath,
      [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json", "--outDir", outDir],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    if (compile.status !== 0) throw new Error(`tsc failed: ${compile.stdout}${compile.stderr}`);
    // The compiled files are ES modules; outside the project folder nothing says so, so say it.
    writeFileSync(join(outDir, "package.json"), '{ "type": "module" }\n');
  }, 150_000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });
```

`beforeAll` runs once before the tests of this file: make a temporary folder, compile the program into it by running the TypeScript compiler (`node_modules/typescript/bin/tsc -p tsconfig.build.json --outDir <folder>`, the same as `npm run build` but with another output folder), fail loudly with the compiler's output if the exit status is not 0, and write a `package.json` containing `{ "type": "module" }` into the folder so Node treats the compiled files as ES modules. The number `150_000` at the end is this hook's own time limit in milliseconds. The comment explains why the test compiles itself: the lab replaces the `build` script with the fork's. `afterAll` runs once after the tests and deletes the folder (`recursive: true` removes folders inside it; `force: true` ignores a folder that is already gone).

Lines 37 to 51:

```ts
  it("prints the injection title as one line of text and runs nothing", () => {
    const result = greeter({
      ISSUE_AUTHOR: "outside-contributor",
      ISSUE_TITLE: 'Looks fine"; echo INJECTED-COMMAND-RAN; echo "',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.split("\n").filter(Boolean)).toHaveLength(1);
    expect(result.stdout).toContain("INJECTED-COMMAND-RAN");
    expect(result.stdout.startsWith("New issue from outside-contributor: Looks fine")).toBe(true);
  });

  it("exits 2 without the variables", () => {
    expect(greeter({}).status).toBe(2);
  });
});
```

Two tests. (1) The title `Looks fine"; echo INJECTED-COMMAND-RAN; echo "` goes in. The exit status must be 0; the output, split into lines (`split("\n")`) with empty ones removed (`.filter(Boolean)` keeps only non-empty texts), must be exactly one line; it contains the text `INJECTED-COMMAND-RAN` (printed as data) and starts with `New issue from outside-contributor: Looks fine`. (2) With an empty environment the program exits with status 2.

<!-- /walk:tests/e2e/greeter-process.test.ts -->

<!-- walk:tests/pipeline/build-result.test.ts -->
### `tests/pipeline/build-result.test.ts`, line by line

Lines 1 to 10:

```ts
import { describe, expect, it } from "vitest";
import { COMMENT_MARKER, InvalidResultError, parseResult, renderComment } from "../../pipeline/build-result.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const valid = JSON.stringify({ pr: 12, sha: SHA, conclusion: "failure" });

describe("parseResult", () => {
  it("accepts the three fields it expects", () => {
    expect(parseResult(valid)).toEqual({ pr: 12, sha: SHA, conclusion: "failure" });
  });
```

Imports, a pretend commit hash `SHA` (forty hexadecimal characters) and `valid`, a JSON text made by `JSON.stringify` from an object with the three expected fields. The first test checks that `parseResult(valid)` returns an object with `pr` 12, the hash, and `conclusion` `failure`.

Lines 12 to 27:

```ts
  it.each([
    ["text that is not JSON", "not json"],
    ["a JSON array", "[]"],
    ["null", "null"],
    ["a pull request number as text", JSON.stringify({ pr: "12", sha: SHA, conclusion: "success" })],
    ["a negative pull request number", JSON.stringify({ pr: -1, sha: SHA, conclusion: "success" })],
    ["a fractional pull request number", JSON.stringify({ pr: 1.5, sha: SHA, conclusion: "success" })],
    ["a huge pull request number", JSON.stringify({ pr: 1e12, sha: SHA, conclusion: "success" })],
    ["a short hash", JSON.stringify({ pr: 1, sha: "abc", conclusion: "success" })],
    ["an upper-case hash", JSON.stringify({ pr: 1, sha: SHA.toUpperCase(), conclusion: "success" })],
    ["a conclusion with a payload", JSON.stringify({ pr: 1, sha: SHA, conclusion: "success\n@everyone" })],
    ["an extra field", JSON.stringify({ pr: 1, sha: SHA, conclusion: "success", body: "x" })],
  ])("rejects %s", (_name, text) => {
    expect(() => parseResult(text)).toThrow(InvalidResultError);
  });
});
```

A table of eleven bad inputs run by `it.each`. Each row is a pair `[description, text]`; `%s` in the test name is replaced by the description. They are: text that is not JSON; `[]` (a JSON array); `null`; `pr` given as the text `"12"`; `pr` of -1; `pr` of 1.5; `pr` of `1e12` (ten to the twelfth power); a three-letter hash; an upper-case hash; a conclusion `success\n@everyone` (a line break and a mention that would notify everyone if it reached a comment); and an extra field `body`. The test function `(_name, text) =>` ignores the first value (`_name`, the underscore says so) and requires `parseResult(text)` to throw `InvalidResultError`.

Lines 29 to 39:

```ts
describe("renderComment", () => {
  it.each([
    ["success", "passed"],
    ["failure", "failed"],
    ["cancelled", "was cancelled"],
  ] as const)("says what happened for %s", (conclusion, words) => {
    const body = renderComment({ pr: 1, sha: SHA, conclusion });
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain(`\`0123456\` ${words}.`);
  });
});
```

A second table with `as const` (so the pairs keep exact types) for the three conclusions. For each, `renderComment` must return a text that begins with the marker `<!-- pr-report -->` and contains `` `0123456` passed. ``, `failed.` or `was cancelled.` after the first seven characters of the hash.

<!-- /walk:tests/pipeline/build-result.test.ts -->

<!-- walk:tests/pipeline/github-comments.test.ts -->
### `tests/pipeline/github-comments.test.ts`, line by line

Lines 1 to 17:

```ts
import { describe, expect, it } from "vitest";
import { COMMENT_MARKER } from "../../pipeline/build-result.js";
import { GitHubComments, HttpError, upsertComment, type Comments } from "../../pipeline/github-comments.js";

class Fake implements Comments {
  readonly calls: string[] = [];
  constructor(private readonly existing: { id: number; body: string }[]) {}
  async list() {
    return this.existing;
  }
  async create(_repo: string, pr: number, body: string) {
    this.calls.push(`create ${pr} ${body}`);
  }
  async update(_repo: string, id: number, body: string) {
    this.calls.push(`update ${id} ${body}`);
  }
}
```

Imports, then a fake `Comments` implementation. It stores the comments it starts with (`private readonly existing`), answers `list` with them, and records every `create` or `update` call as a text in `calls`. `async list()` returns a promise, as the interface requires (see `typescript.md` for `async`).

Lines 19 to 35:

```ts
describe("upsertComment", () => {
  it("creates the comment when none of ours exists", async () => {
    const api = new Fake([{ id: 1, body: "someone else's comment" }]);
    expect(await upsertComment(api, "o/r", 5, `${COMMENT_MARKER}\nhi`)).toBe("created");
    expect(api.calls).toEqual([`create 5 ${COMMENT_MARKER}\nhi`]);
  });

  it("updates our earlier comment instead of adding another", async () => {
    const api = new Fake([{ id: 9, body: `${COMMENT_MARKER}\nold` }]);
    expect(await upsertComment(api, "o/r", 5, `${COMMENT_MARKER}\nnew`)).toBe("updated");
    expect(api.calls).toEqual([`update 9 ${COMMENT_MARKER}\nnew`]);
  });

  it("refuses a repository name that is not owner/name", async () => {
    await expect(upsertComment(new Fake([]), "o/r/../../x", 5, "b")).rejects.toThrow(/not a repository name/);
  });
});
```

Three tests of `upsertComment`. (1) With only someone else's comment present, it creates one: the result is `created` and the recorded call is `create 5 <marker>\nhi`. (2) With an earlier comment that starts with the marker, it updates that one (`updated`; the recorded call is `update 9 ...new`). (3) The repository name `o/r/../../x` would climb out of the URL path; `rejects`/`toThrow` with `/not a repository name/` shows it is refused. `await expect(promise).rejects.toThrow(...)` is how a failing promise is checked.

Lines 37 to 49:

```ts
function answers(...statuses: (number | Error)[]): { fetchFn: typeof fetch; seen: string[] } {
  const seen: string[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    seen.push(`${init?.method} ${url}`);
    const next = statuses.shift();
    if (next instanceof Error) throw next;
    const status = next ?? 200;
    return new Response(status === 200 ? "[]" : "no", { status });
  }) as unknown as typeof fetch;
  return { fetchFn, seen };
}

const noSleep = async () => {};
```

`answers(...statuses)` builds a **scripted fake of `fetch`** (the function that makes web requests). The rest parameter `...statuses` collects all arguments into a list of numbers (HTTP status codes) or `Error` objects. Each fake call records `METHOD URL` in `seen`, takes the next scripted item with `shift()` (which removes and returns the first item), throws it if it is an error (a simulated network failure), and otherwise returns a real `Response` object with that status and the body `[]` (an empty list) for 200 or `no` for anything else. `as unknown as typeof fetch` tells the compiler to treat the fake as a real `fetch`. `noSleep` is a pretend wait that returns immediately, so retries cost no time.

Lines 51 to 91:

```ts
describe("GitHubComments", () => {
  it("sends the token, lists comments and posts a new one", async () => {
    const { fetchFn, seen } = answers(200, 200);
    const api = new GitHubComments({ token: "t", fetchFn, sleep: noSleep });
    expect(await api.list("o/r", 3)).toEqual([]);
    await api.create("o/r", 3, "body");
    expect(seen).toEqual([
      "GET https://api.github.com/repos/o/r/issues/3/comments?per_page=100",
      "POST https://api.github.com/repos/o/r/issues/3/comments",
    ]);
  });

  it("updates a comment with PATCH", async () => {
    const { fetchFn, seen } = answers(200);
    await new GitHubComments({ token: "t", fetchFn, sleep: noSleep }).update("o/r", 77, "b");
    expect(seen).toEqual(["PATCH https://api.github.com/repos/o/r/issues/comments/77"]);
  });

  it("retries a 503 and a network error, then succeeds", async () => {
    const { fetchFn, seen } = answers(503, new Error("socket hang up"), 200);
    const sleeps: number[] = [];
    const api = new GitHubComments({ token: "t", fetchFn, sleep: async (ms) => void sleeps.push(ms) });
    await api.create("o/r", 1, "b");
    expect(seen).toHaveLength(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it("does not retry a 4xx", async () => {
    const { fetchFn, seen } = answers(403);
    const api = new GitHubComments({ token: "t", fetchFn, sleep: noSleep });
    await expect(api.create("o/r", 1, "b")).rejects.toBeInstanceOf(HttpError);
    expect(seen).toHaveLength(1);
  });

  it("gives up after the last attempt and reports the last error", async () => {
    const { fetchFn, seen } = answers(500, 500, 502);
    const api = new GitHubComments({ token: "t", fetchFn, sleep: noSleep, attempts: 3 });
    await expect(api.create("o/r", 1, "b")).rejects.toThrow(/502/);
    expect(seen).toHaveLength(3);
  });
});
```

Five tests of `GitHubComments`. (1) Sends the token: a `list` followed by a `create` produce exactly the two requests `GET https://api.github.com/repos/o/r/issues/3/comments?per_page=100` and `POST https://api.github.com/repos/o/r/issues/3/comments`, and `list` returns the empty list. (2) `update` uses `PATCH .../issues/comments/77`. (3) Scripted answers `503`, an `Error("socket hang up")`, then `200`: three requests are made and the recorded waits are `[500, 1000]` (the exponential back-off), where `sleep: async (ms) => void sleeps.push(ms)` records each wait; `void` discards the return value of `push`. (4) A `403` is **not** retried: one request, and the promise rejects with an `HttpError` (`toBeInstanceOf`). (5) Three failures `500, 500, 502` with `attempts: 3`: three requests, and the final error mentions `502`, the last one.

<!-- /walk:tests/pipeline/github-comments.test.ts -->

<!-- walk:tests/pipeline/checklist.test.ts -->
### `tests/pipeline/checklist.test.ts`, line by line

Lines 1 to 14:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RULES, lintPaths, type Finding } from "../../pipeline/harden-lint.js";

const root = resolve(import.meta.dirname, "../..");
const checklist = readFileSync(resolve(root, "docs/review-checklist.md"), "utf8");
const findings = lintPaths([resolve(root, "exploit/vulnerable/.github/workflows")]);

/** Every `path:line` the checklist names for a lab file. */
const labReferences = [...checklist.matchAll(/`(exploit\/vulnerable\/[\w./-]+\.yml):(\d+)`/g)].map((match) => ({
  file: match[1] ?? "",
  line: Number(match[2]),
}));
```

Imports, the repository root, the text of the checklist, the findings of the linter on the lab folder, and `labReferences`: a regular expression `/`(exploit\/vulnerable\/[\w./-]+\.yml):(\d+)`/g` finds every inline-code reference such as `` `exploit/vulnerable/greet.yml:14` `` in the checklist. The backticks are part of the pattern; `(...)` marks the two captured pieces (the file path and the line number; `\d+` is one or more digits). `[...text.matchAll(re)]` collects all matches, and `.map` turns each into `{ file, line }` with `Number(match[2])` converting the text to a number.

Lines 16 to 39:

```ts
describe("docs/review-checklist.md", () => {
  it("names at least one line of the lab for each of the three attacks", () => {
    const files = new Set(labReferences.map((reference) => reference.file.split("/").pop()));
    expect(files).toEqual(new Set(["greet.yml", "pr-build.yml", "label.yml"]));
  });

  it.each(labReferences)("$file:$line is a line the linter reports", ({ file, line }) => {
    const atLine = findings.filter(
      (finding: Finding) => finding.file.endsWith(file.replace("exploit/vulnerable/", "")) && finding.line === line,
    );
    expect(atLine.length).toBeGreaterThan(0);
  });

  it("mentions only rules that exist", () => {
    const mentioned = [...checklist.matchAll(/`([a-z]+(?:-[a-z]+)+)`/g)]
      .map((match) => match[1] ?? "")
      .filter((name) => name in RULES);
    expect(new Set(mentioned).size).toBe(Object.keys(RULES).length);
  });

  it("includes pinning actions to commit SHAs", () => {
    expect(checklist).toMatch(/pinned to a full commit SHA/);
  });
});
```

Four checks. (1) The set of file names mentioned is exactly `greet.yml`, `pr-build.yml`, `label.yml`. (2) `it.each(labReferences)` makes one test per reference, named `$file:$line is a line the linter reports`: at least one finding must exist at that file and line. (3) Every rule name written in backticks with hyphens (found with another regular expression) that is also a key of `RULES` counts; the count must equal the number of rules (8), so the checklist mentions all of them. (4) The text must match `/pinned to a full commit SHA/`.

<!-- /walk:tests/pipeline/checklist.test.ts -->

<!-- walk:tests/pipeline/trust-policy.test.ts -->
### `tests/pipeline/trust-policy.test.ts`, line by line

Lines 1 to 24:

```ts
import { describe, expect, it } from "vitest";
import { evaluate, likeToRegExp, scenarios, type TrustPolicy } from "../../pipeline/trust-policy.js";

const HOST = "token.actions.githubusercontent.com";
const PROVIDER = `arn:aws:iam::123456789012:oidc-provider/${HOST}`;
const REPO = "owner/vulnerable-demo";

const policy = (condition: TrustPolicy["Statement"][number]["Condition"]): TrustPolicy => ({
  Statement: [
    {
      Effect: "Allow",
      Action: "sts:AssumeRoleWithWebIdentity",
      Principal: { Federated: PROVIDER },
      ...(condition ? { Condition: condition } : {}),
    },
  ],
});

const scoped = policy({
  StringEquals: {
    [`${HOST}:aud`]: "sts.amazonaws.com",
    [`${HOST}:sub`]: `repo:${REPO}:environment:production`,
  },
});
```

Imports and test fixtures. `HOST`, `PROVIDER` and `REPO` are constants. The helper `policy(condition)` builds a trust policy with one `Allow` statement for `sts:AssumeRoleWithWebIdentity`; `...(condition ? { Condition: condition } : {})` adds a `Condition` only when one is given. The type `TrustPolicy["Statement"][number]["Condition"]` means "the type of the `Condition` field of one statement of a policy". `scoped` is the policy Terraform really generates: exact `aud` and `sub`.

Lines 26 to 32:

```ts
describe("likeToRegExp", () => {
  it("treats * and ? as wildcards and everything else literally", () => {
    expect(likeToRegExp("repo:o/r:*").test("repo:o/r:environment:production")).toBe(true);
    expect(likeToRegExp("a?c").test("abc")).toBe(true);
    expect(likeToRegExp("a.c").test("abc")).toBe(false);
  });
});
```

`likeToRegExp`: `repo:o/r:*` matches `repo:o/r:environment:production` (the `*` is a wildcard); `a?c` matches `abc` (`?` is one character); `a.c` does **not** match `abc` (the dot is a literal dot).

Lines 34 to 92:

```ts
describe("evaluate", () => {
  it("lets the approved deploy job in", () => {
    const decision = evaluate(
      scoped,
      { aud: "sts.amazonaws.com", sub: `repo:${REPO}:environment:production` },
      HOST,
      PROVIDER,
    );
    expect(decision).toEqual({ allowed: true, reason: "every condition holds" });
  });

  it("refuses another subject and says which condition failed", () => {
    const decision = evaluate(
      scoped,
      { aud: "sts.amazonaws.com", sub: `repo:${REPO}:ref:refs/heads/x` },
      HOST,
      PROVIDER,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain(`${HOST}:sub`);
  });

  it("refuses another provider", () => {
    const decision = evaluate(
      scoped,
      { aud: "sts.amazonaws.com", sub: `repo:${REPO}:environment:production` },
      HOST,
      "arn:other",
    );
    expect(decision).toEqual({ allowed: false, reason: "the token comes from a different identity provider" });
  });

  it("a policy with no condition trusts every repository, which is the mistake the lesson warns about", () => {
    const open = policy(undefined);
    expect(evaluate(open, { aud: "x", sub: "repo:anyone/anything:pull_request" }, HOST, PROVIDER).allowed).toBe(true);
  });

  it("supports StringLike and fails closed on an operator it does not know", () => {
    const like = policy({ StringLike: { [`${HOST}:sub`]: `repo:${REPO}:*` } });
    expect(evaluate(like, { aud: "x", sub: `repo:${REPO}:ref:refs/heads/main` }, HOST, PROVIDER).allowed).toBe(true);
    const unknown = policy({ ForAnyValue: { [`${HOST}:sub`]: "x" } });
    expect(evaluate(unknown, { aud: "x", sub: "x" }, HOST, PROVIDER).allowed).toBe(false);
  });

  it("fails closed on a condition key that is not a claim, and on a non-Allow or non-AssumeRole statement", () => {
    const strange = policy({ StringEquals: { "other:key": "x" } });
    expect(evaluate(strange, { aud: "x", sub: "x" }, HOST, PROVIDER).reason).toContain("is not a claim");
    const deny: TrustPolicy = { Statement: [{ Effect: "Deny", Action: "*", Principal: {} }] };
    expect(evaluate(deny, { aud: "x", sub: "x" }, HOST, PROVIDER).allowed).toBe(false);
    const wrongAction: TrustPolicy = { Statement: [{ Effect: "Allow", Action: "s3:*", Principal: {} }] };
    expect(evaluate(wrongAction, { aud: "x", sub: "x" }, HOST, PROVIDER).allowed).toBe(false);
  });

  it("accepts a list of allowed subjects as alternatives", () => {
    const either = policy({ StringEquals: { [`${HOST}:sub`]: ["a", "b"] } });
    expect(evaluate(either, { aud: "x", sub: "b" }, HOST, PROVIDER).allowed).toBe(true);
    expect(evaluate(either, { aud: "x", sub: "c" }, HOST, PROVIDER).allowed).toBe(false);
  });
});
```

Seven tests of `evaluate`. (1) The approved job's token is allowed: `{ allowed: true, reason: "every condition holds" }`. (2) A branch subject is refused and the reason names the `...:sub` key. (3) A different identity provider ARN is refused with the exact reason `the token comes from a different identity provider`. (4) A policy with **no condition** lets in a token from `repo:anyone/anything:pull_request`; the test name says this is the mistake the lesson warns about. (5) `StringLike` with `repo:owner/vulnerable-demo:*` allows a branch subject, but an unknown operator (`ForAnyValue`) fails closed. (6) A condition on a key that is not a claim (`other:key`) gives a reason containing `is not a claim`; a `Deny` statement and a statement for another action (`s3:*`) are both refused. (7) A list of allowed subjects works as alternatives: `b` is allowed, `c` is not.

Lines 94 to 104:

```ts
describe("scenarios against the scoped policy", () => {
  it("lets exactly one in: the approved job in the production environment", () => {
    const results = scenarios(REPO, "production").map((s) => [
      s.name,
      evaluate(scoped, s.token, HOST, PROVIDER).allowed,
      s.expected,
    ]);
    for (const [, allowed, expected] of results) expect(allowed).toBe(expected);
    expect(results.filter(([, allowed]) => allowed)).toHaveLength(1);
  });
});
```

All eight scenarios from `scenarios(REPO, "production")` are run through `evaluate` with the scoped policy. Each answer must equal the scenario's expected answer, and exactly one (`filter(([, allowed]) => allowed)`; the empty slot before the comma skips the name) is allowed.

<!-- /walk:tests/pipeline/trust-policy.test.ts -->

<!-- walk:tests/pipeline/harden-lint.test.ts -->
### `tests/pipeline/harden-lint.test.ts`, line by line

Lines 1 to 16:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RULES,
  formatFinding,
  lintPaths,
  lintWorkflow,
  triggersOf,
  untrustedReferences,
} from "../../pipeline/harden-lint.js";

const root = resolve(import.meta.dirname, "../..");
const SHA = "a".repeat(40);

const rulesOf = (text: string) => lintWorkflow("w.yml", text).map((finding) => finding.rule);
```

Imports, the repository root, `SHA` (forty `a` characters standing in for a commit hash) and the helper `rulesOf(text)`, which lints a workflow given as text and returns only the names of the rules that fired.

Lines 18 to 44:

```ts
describe("untrustedReferences", () => {
  it("finds event fields a stranger can type", () => {
    expect(untrustedReferences("echo ${{ github.event.issue.title }} ${{ github.head_ref }}")).toEqual([
      "github.event.issue.title",
      "github.head_ref",
    ]);
  });

  it("ignores numbers and ids GitHub generates", () => {
    expect(untrustedReferences("${{ github.event.pull_request.number }} ${{ github.event.workflow_run.id }}")).toEqual(
      [],
    );
  });

  it("ignores text outside expressions", () => {
    expect(untrustedReferences("echo github.event.issue.title")).toEqual([]);
  });
});

describe("triggersOf", () => {
  it("reads a string, a list and a map", () => {
    expect(triggersOf("push")).toEqual(["push"]);
    expect(triggersOf(["push", "pull_request"])).toEqual(["push", "pull_request"]);
    expect(triggersOf({ issues: { types: ["opened"] } })).toEqual(["issues"]);
    expect(triggersOf(undefined)).toEqual([]);
  });
});
```

`untrustedReferences`: finds `github.event.issue.title` and `github.head_ref` inside `${{ }}`; ignores the numbers GitHub generates (`github.event.pull_request.number`, `github.event.workflow_run.id`); ignores the same words outside an expression. `triggersOf` reads `"push"` (text), a list, a map `{ issues: { types: ["opened"] } }` and `undefined`.

Lines 46 to 75:

```ts
describe("rules, one at a time", () => {
  it("script-injection: an event field in a run step", () => {
    const text = `on: issues\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo "\${{ github.event.issue.title }}"\n`;
    expect(rulesOf(text)).toEqual(["script-injection"]);
  });

  it("script-injection: an event field in a github-script body", () => {
    const text = `on: issues\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/github-script@${SHA}\n        with:\n          script: console.log("\${{ github.event.issue.body }}")\n`;
    expect(rulesOf(text)).toEqual(["script-injection"]);
  });

  it("the same field through env is clean", () => {
    const text = `on: issues\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - env:\n          TITLE: \${{ github.event.issue.title }}\n        run: echo "$TITLE"\n`;
    expect(rulesOf(text)).toEqual([]);
  });

  it("privileged-checkout: pull_request_target checking out the head", () => {
    const text = `on: pull_request_target\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@${SHA}\n        with:\n          ref: \${{ github.event.pull_request.head.sha }}\n          persist-credentials: false\n`;
    expect(rulesOf(text)).toEqual(["privileged-checkout"]);
  });

  it("privileged-checkout: workflow_run checking out the triggering head branch", () => {
    const text = `on:\n  workflow_run:\n    workflows: [x]\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@${SHA}\n        with:\n          ref: \${{ github.event.workflow_run.head_sha }}\n          persist-credentials: false\n`;
    expect(rulesOf(text)).toContain("privileged-checkout");
  });

  it("a plain checkout under pull_request_target is not privileged-checkout", () => {
    const text = `on: pull_request_target\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@${SHA}\n        with:\n          persist-credentials: false\n`;
    expect(rulesOf(text)).toEqual([]);
  });
```

Rules one at a time (1/3). Each test builds a tiny workflow as a text with `\n` for line breaks. Script injection in a `run` step; in an `actions/github-script` body (`with: script:`); the same value passed through `env` is clean (empty list). Privileged checkout: `pull_request_target` checking out `pull_request.head.sha`; `workflow_run` checking out `workflow_run.head_sha`; and the negative case, a plain checkout under `pull_request_target`, which is not flagged.

Lines 77 to 126:

```ts
  it("missing-permissions: neither the workflow nor the job says", () => {
    expect(rulesOf(`on: push\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo hi\n`)).toEqual([
      "missing-permissions",
    ]);
  });

  it("a job-level permissions block satisfies missing-permissions", () => {
    expect(
      rulesOf(
        `on: push\njobs:\n  j:\n    runs-on: x\n    permissions:\n      contents: read\n    steps:\n      - run: echo hi\n`,
      ),
    ).toEqual([]);
  });

  it("broad-permissions: write-all is an error, workflow-level write is a warning", () => {
    const all = lintWorkflow(
      "w.yml",
      `on: push\npermissions: write-all\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo hi\n`,
    );
    expect(all.map((f) => [f.rule, f.severity])).toEqual([["broad-permissions", "error"]]);
    const top = lintWorkflow(
      "w.yml",
      `on: push\npermissions:\n  contents: write\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo hi\n`,
    );
    expect(top.map((f) => [f.rule, f.severity])).toEqual([["broad-permissions", "warning"]]);
  });

  it("broad-permissions: write-all on a job", () => {
    expect(
      rulesOf(
        `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    permissions: write-all\n    steps:\n      - run: echo hi\n`,
      ),
    ).toEqual(["broad-permissions"]);
  });

  it("unpinned-action: a tag, and a reusable workflow called by tag", () => {
    expect(
      rulesOf(
        `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/setup-node@v4\n`,
      ),
    ).toEqual(["unpinned-action"]);
    expect(rulesOf(`on: push\npermissions: {}\njobs:\n  j:\n    uses: o/r/.github/workflows/x.yml@v1\n`)).toEqual([
      "unpinned-action",
    ]);
  });

  it("unpinned-action: a SHA, a local path and a digest are fine", () => {
    const text = `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/setup-node@${SHA}\n      - uses: ./local\n      - uses: docker://alpine@sha256:${"b".repeat(64)}\n`;
    expect(rulesOf(text)).toEqual([]);
  });
```

Rules one at a time (2/3). `missing-permissions` when neither level has `permissions`; a job-level block satisfies it. `broad-permissions`: top-level `write-all` is an error, top-level `contents: write` is a warning (the test maps each finding to `[rule, severity]`), job-level `write-all` is flagged. `unpinned-action`: `actions/setup-node@v4` and a reusable workflow `o/r/.github/workflows/x.yml@v1` are flagged; a SHA, a local `./local` path and `docker://alpine@sha256:<64 hex>` are fine.

Lines 128 to 159:

```ts
  it("persist-credentials: a checkout that keeps the token", () => {
    const text = `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@${SHA}\n`;
    expect(lintWorkflow("w.yml", text).map((f) => [f.rule, f.severity])).toEqual([["persist-credentials", "warning"]]);
  });

  it("stored-cloud-key: a long-lived credential from a secret", () => {
    const text = `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    env:\n      AWS_ACCESS_KEY_ID: \${{ secrets.AWS_ACCESS_KEY_ID }}\n    steps:\n      - run: echo hi\n`;
    expect(rulesOf(text)).toEqual(["stored-cloud-key"]);
    const inStep = `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo hi\n        env:\n          KEY: \${{ secrets.DEPLOY_TOKEN }}\n`;
    expect(rulesOf(inStep)).toEqual(["stored-cloud-key"]);
  });

  it("oidc-without-environment: id-token write on a job with no environment", () => {
    const text = `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    permissions:\n      id-token: write\n    steps:\n      - run: echo hi\n`;
    expect(lintWorkflow("w.yml", text).map((f) => [f.rule, f.severity])).toEqual([
      ["oidc-without-environment", "warning"],
    ]);
  });
});

describe("findings", () => {
  it("carry the line of the offending key and format as file:line", () => {
    const text = `on: issues\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo "\${{ github.event.issue.title }}"\n`;
    const findings = lintWorkflow("w.yml", text);
    expect(findings[0]?.line).toBe(7);
    expect(findings.map(formatFinding)[0]).toMatch(/^w\.yml:7: error \[script-injection\] .*\(job j\)$/);
  });

  it("every rule has a description", () => {
    for (const description of Object.values(RULES)) expect(description.length).toBeGreaterThan(20);
  });
});
```

Rules one at a time (3/3) and findings. `persist-credentials` warns when checkout keeps the token. `stored-cloud-key` flags `AWS_ACCESS_KEY_ID` at job level and `DEPLOY_TOKEN` inside a step. `oidc-without-environment` warns for `id-token: write` with no environment. Then: a finding carries the line number 7 and formats as `w.yml:7: error [script-injection] ... (job j)` (the pattern `/^w\.yml:7: .../` checks it); and every rule description is longer than 20 characters.

Lines 161 to 190:

```ts
describe("the lab and the repository", () => {
  const vulnerable = join(root, "exploit/vulnerable/.github/workflows");

  it("finds the injection in the lab's greet.yml", () => {
    const rules = lintPaths([join(vulnerable, "greet.yml")]).map((f) => f.rule);
    expect(rules).toContain("script-injection");
    expect(rules).toContain("missing-permissions");
  });

  it("finds the privileged checkout, the secret and the unpinned action in the lab's pr-build.yml", () => {
    const rules = lintPaths([join(vulnerable, "pr-build.yml")]).map((f) => f.rule);
    expect(rules).toEqual(
      expect.arrayContaining(["privileged-checkout", "stored-cloud-key", "missing-permissions", "unpinned-action"]),
    );
  });

  it("finds the missing permissions in the lab's label.yml", () => {
    expect(lintPaths([join(vulnerable, "label.yml")]).map((f) => f.rule)).toEqual(["missing-permissions"]);
  });

  it("finds nothing at all in the repository's own workflows", () => {
    expect(lintPaths([join(root, ".github/workflows")]).map(formatFinding)).toEqual([]);
  });

  it("reads every workflow file of a folder and ignores other files", () => {
    const names = readdirSync(join(root, ".github/workflows")).filter((n) => n.endsWith(".yml"));
    expect(names.length).toBeGreaterThanOrEqual(6);
    expect(readFileSync(join(vulnerable, "label.yml"), "utf8")).toContain("DELIBERATELY VULNERABLE");
  });
});
```

The lab and the repository. The lab's `greet.yml` fires `script-injection` and `missing-permissions`; `pr-build.yml` fires `privileged-checkout`, `stored-cloud-key`, `missing-permissions` and `unpinned-action` (`expect.arrayContaining` means "at least these"); `label.yml` fires exactly `missing-permissions`; the repository's own workflows give **no** findings; a folder read finds at least six `.yml` files, and the lab file contains the text `DELIBERATELY VULNERABLE`.

<!-- /walk:tests/pipeline/harden-lint.test.ts -->

## Try it yourself

1. `npx vitest --version` prints `vitest/5.0.5` and your platform.
2. `npx vitest run --coverage` ends with `Test Files  10 passed (10)`, `Tests  90 passed (90)` and a coverage table.
3. `npx vitest run tests/unit/greeting.test.ts` runs one file.
4. `npx vitest run -t "rejects the author"` runs only tests whose name contains that text.
5. In `vitest.config.ts` change `lines: 95` to `lines: 101`, run `npx vitest run --coverage; echo $?`, read the threshold error and the non-zero code, then `git checkout vitest.config.ts`.

## Mistakes people make

- Running plain `vitest` in CI, which waits forever in watch mode.
- Assuming Vitest checks types. It does not; `npm run typecheck` does.
- Chasing 100 percent coverage with tests that assert nothing.
- Tests that depend on the order of other tests or on shared state.
- Real network calls or real waiting in unit tests. Here the web service and the sleep are replaced.

## Check yourself

1. What does `expect(a).toBe(b)` do when they differ? *(Throws an error, so the test fails.)*
2. Why are the `*-cli.ts` files excluded from coverage? *(They are covered by running the program as a separate process, which coverage cannot see.)*
3. What makes `vitest run --coverage` fail even when every test passes? *(A coverage percentage below its threshold.)*
4. Why is the end-to-end test given a longer time limit? *(It compiles TypeScript and starts a process.)*
5. What does `checklist.test.ts` protect? *(That the lines named in the review checklist are really flagged by the linter.)*

## Further reading

- Vitest guide: https://vitest.dev/guide/
- Coverage: https://vitest.dev/guide/coverage
- Configuration reference: https://vitest.dev/config/
- Vite: https://vite.dev/guide/
