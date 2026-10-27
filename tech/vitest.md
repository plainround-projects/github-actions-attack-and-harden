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

### `tests/unit/greeting.test.ts` (the rules of the domain)

The file imports `describe`, `expect`, `it` from `vitest`, and the functions under test. It groups tests by function.

`describe("sanitizeTitle")` has four tests:

1. "keeps an ordinary title as it is": `sanitizeTitle("Build fails on Windows")` returns the same text.
2. "turns line breaks and control characters into single spaces": the input `"one\r\ntwo\u0000\u001b[31mthree"` contains a carriage return and a line feed (`\r\n`, the Windows line ending), a null character (`\u0000`) and an escape character (`\u001b`, which terminals use to start colours). The expected result is `"one two [31mthree"`: every control character became a space, the runs collapsed to one space, and the visible `[31m` stayed.
3. "leaves shell metacharacters alone because they are only ever printed": `x"; echo hi; echo "` comes back unchanged. A **metacharacter** is a character with a special meaning to the shell (such as `"`, `;`). This test documents that the program does not try to "clean" them; safety comes from never sending the text to a shell.
4. "cuts a long title with an ellipsis at the limit": `"a".repeat(500)` becomes a text of exactly `MAX_TITLE_LENGTH` (80) characters ending with `…`.

`describe("createGreeting")`:

1. "builds an immutable greeting from a login and a title": `createGreeting("octocat", "  Hello  ")` returns an object equal to `{ author: "octocat", title: "Hello" }` (`toEqual` compares objects by their contents; `toBe` would compare identity).
2. `it.each([...])("rejects the author %j", ...)`: `it.each(list)(name, fn)` runs the same test once for each item. `%j` in the name is replaced by the item as JSON. The list is `""` (empty), `"-leading"` (starts with a hyphen), `"has space"`, forty `a` characters (too long, 40 > 39), `"semi;colon"` and `"$(id)"` (a shell command substitution). Each must make `createGreeting` throw `GreetingError`. `expect(() => ...).toThrow(GreetingError)` needs the call wrapped in a function so Vitest can catch the error itself.
3. "rejects a title that is empty once cleaned": `" \n\t "` is only whitespace; the error message must match the pattern `/empty/`.

`describe("renderGreeting")`: one test: the greeting object becomes `"New issue from octocat: Hello"`.

### `tests/unit/greet-issue.test.ts`

```ts
class RecordingNotifier implements Notifier {
  readonly lines: string[] = [];
  notify(line: string): void {
    this.lines.push(line);
  }
}
```

A test double: a class that implements the `Notifier` interface by saving each line in a list (`push` adds to the end). Two tests: "sends one line to the notifier" (after `run("octocat", "Hello")` the list is `["New issue from octocat: Hello"]`) and "sends nothing when the issue is unusable" (`run("not a login", "Hello")` throws `GreetingError` and the list stays empty, proving the notifier was never called).

### `tests/unit/cli.test.ts`

```ts
function run(env: Record<string, string | undefined>) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main({ env, stdout: { write: (c) => out.push(c) }, stderr: { write: (c) => err.push(c) } });
  return { code, out: out.join(""), err: err.join("") };
}
```

A helper: call `main` with a fake environment and two fake streams that collect what is written. It returns the exit code and the text of each stream. Four tests: success (`{ code: 0, out: "New issue from octocat: Hello\n", err: "" }`); a hostile title (`x"; echo INJECTED; echo "`) is printed as plain text; a missing `ISSUE_TITLE` gives exit code 2 and a message naming the variable; an invalid author gives exit code 1 and "not a valid author login". A second group, "main with a failing output stream", gives `main` a stream whose `write` throws `new Error("disk full")` and asserts the error **escapes** (`toThrow("disk full")`): errors that are not `GreetingError` must not be hidden.

### `tests/integration/stream-notifier.test.ts`

An **integration test** checks that two real parts work together. Here a real `PassThrough` stream (a Node object that can be written to and read from) replaces a fake. Test 1 writes `"one"` and `"two"` through `StreamNotifier` and reads back `"one\ntwo\n"`. Test 2 runs the whole use case into the stream and reads `"New issue from octocat: Hello\n"`. `stream.end()` closes the writing side before reading.

### `tests/e2e/greeter-process.test.ts`

An **end-to-end test** runs the finished program the way a user does.

```ts
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

`import.meta.dirname` is the folder of the current file; `resolve(..., "../..")` goes two folders up to the repository root. `spawnSync` starts another program and waits for it. `process.execPath` is the path of the Node program running the test, so the child uses the same Node. `env` is the child's whole environment: only `PATH` and the variables the test chooses (so no secrets leak in). `encoding: "utf8"` returns output as text. `timeout` kills the child after 20 seconds.

```ts
beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), "greeter-"));
  const compile = spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json", "--outDir", outDir], { cwd: root, encoding: "utf8", timeout: 120_000 });
  if (compile.status !== 0) throw new Error(`tsc failed: ${compile.stdout}${compile.stderr}`);
  writeFileSync(join(outDir, "package.json"), '{ "type": "module" }\n');
}, 150_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});
```

`beforeAll` runs once before the tests of the file: make a temporary folder (`mkdtempSync` in the system's temp directory), compile the program into it with the TypeScript compiler (the same command as `npm run build` but with a different output folder), and write a tiny `package.json` there so Node treats the compiled files as ES modules. The second argument `150_000` is this hook's own time limit. `afterAll` deletes the folder (`recursive` removes folders inside; `force` ignores a missing one). The test compiles by itself instead of calling `npm run build` because the lab replaces the `build` script with the fork's.

Two tests: "prints the injection title as one line of text and runs nothing" (exit status 0; standard output, split into lines with empty ones removed by `.filter(Boolean)`, has exactly one line; it contains `INJECTED-COMMAND-RAN` but starts with `New issue from outside-contributor: Looks fine`), and "exits 2 without the variables" (`greeter({}).status` is 2).

### `tests/pipeline/build-result.test.ts`

`parseResult` accepts `{ pr: 12, sha: <40 hex>, conclusion: "failure" }`. A table of eleven bad inputs, each of which must throw `InvalidResultError`, run through `it.each`: text that is not JSON; a JSON array; `null`; a pull request number given as text (`"12"`); a negative number; a fraction (`1.5`); a huge number (`1e12`, which is 10 to the power 12); a short hash (`"abc"`); an upper-case hash; a conclusion with a payload (`"success\n@everyone"`, which would ping everybody if it reached a comment); an extra field (`body`). Then `renderComment` is tested for the three conclusions (`as const` keeps the table's types exact): the comment starts with the marker and contains "`0123456` passed." / "failed." / "was cancelled.".

### `tests/pipeline/github-comments.test.ts`

A `Fake` class implements the `Comments` interface and records calls. `upsertComment` tests: creates when none of ours exists (another person's comment is ignored); updates our earlier comment instead of adding another; refuses the repository name `o/r/../../x` (an attempt to climb out of the URL path). Then the real `GitHubComments` class is tested with a scripted fake `fetch`:

```ts
function answers(...statuses: (number | Error)[]) {
  const seen: string[] = [];
  const fetchFn = (async (url, init) => {
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

`...statuses` collects all arguments into a list. Each fake call records `METHOD URL`, takes the next scripted item (`shift()` removes and returns the first), and either throws it (an `Error` simulates a network failure) or returns a real `Response` object with that status. `noSleep` is a sleep that returns at once. Five tests: it sends the token, lists comments and posts (the recorded requests are `GET .../issues/3/comments?per_page=100` and `POST .../issues/3/comments`); it updates with `PATCH .../issues/comments/77`; it retries a 503 and a network error ("socket hang up") then succeeds (3 requests; the recorded waits are `[500, 1000]`); it does not retry a 403 (1 request, rejects with an `HttpError`); it gives up after the third attempt and reports the last error (`500, 500, 502` leads to an error matching `/502/` after 3 requests).

### `tests/pipeline/harden-lint.test.ts`

Helper: `rulesOf(text)` lints a workflow given as text and returns just the rule names. `SHA` is forty `a` characters (a pretend commit). The workflows under test are written as template strings with `\n` line breaks to keep each test short. Groups:

- **`untrustedReferences`**: finds `github.event.issue.title` and `github.head_ref` inside `${{ }}`; ignores the generated numbers `github.event.pull_request.number` and `github.event.workflow_run.id`; ignores the same words outside an expression.
- **`triggersOf`**: reads `on: push` (a text), `["push", "pull_request"]` (a list), `{ issues: { types: ["opened"] } }` (a map) and `undefined`.
- **Rules, one at a time** (fifteen tests): script-injection in a `run` step; in an `actions/github-script` body (`with.script`); the same field passed through `env` is clean; privileged-checkout under `pull_request_target` with `ref: ...pull_request.head.sha`; the same under `workflow_run` with `head_sha`; a plain checkout under `pull_request_target` is *not* privileged-checkout; missing-permissions when neither level says; a job-level `permissions` satisfies it; broad-permissions (`write-all` is an error, workflow-level `contents: write` is a warning, `write-all` on a job is an error); unpinned-action for a tag and for a reusable workflow called by tag (`uses: o/r/.github/workflows/x.yml@v1` at job level); a SHA, a local path `./local` and a Docker image pinned by digest (`docker://alpine@sha256:<64 hex>`) are fine; persist-credentials warns when checkout keeps the token; stored-cloud-key for `AWS_ACCESS_KEY_ID` at job level and for `DEPLOY_TOKEN` inside a step; oidc-without-environment as a warning.
- **`findings`**: a finding carries the correct line number (7) and formats as `w.yml:7: error [script-injection] ... (job j)`; every rule has a description longer than 20 characters.
- **The lab and the repository**: the lab's `greet.yml` triggers `script-injection` and `missing-permissions`; `pr-build.yml` triggers `privileged-checkout`, `stored-cloud-key`, `missing-permissions` and `unpinned-action` (`expect.arrayContaining` means "at least these"); `label.yml` triggers exactly `missing-permissions`; the repository's own workflows give no findings; a folder read picks up at least six workflow files, and the lab file carries the text `DELIBERATELY VULNERABLE`.

### `tests/pipeline/trust-policy.test.ts`

Builds a `scoped` policy equal to the one Terraform generates (exact `aud` and `sub`) and a helper `policy(condition)` for variations.

- `likeToRegExp`: `*` and `?` are wildcards; `.` is literal (`a.c` does not match `abc`).
- `evaluate`: lets the approved job in (`{ allowed: true, reason: "every condition holds" }`); refuses another subject and names the failed key; refuses another identity provider; a policy with **no condition** trusts every repository (`repo:anyone/anything:pull_request`) which is the mistake the lesson warns about; supports `StringLike` and **fails closed** on the unknown operator `ForAnyValue`; fails closed on a condition key that is not a claim, on a `Deny` statement and on a statement for a different action (`s3:*`); a list of subjects works as alternatives.
- `scenarios against the scoped policy`: runs the eight scenarios; each answer matches its expectation, and exactly one is allowed.

### `tests/pipeline/checklist.test.ts`

Reads `docs/review-checklist.md`, extracts every reference such as `exploit/vulnerable/greet.yml:14` with a regular expression, and checks: all three lab files are named; each named line is one the linter really reports (`it.each(labReferences)("$file:$line ...")`); every rule named in backticks exists in `RULES` and all eight are named; the checklist contains the words "pinned to a full commit SHA". The document cannot drift away from the tool.

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
