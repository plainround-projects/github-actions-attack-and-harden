# Vitest (with @vitest/coverage-v8 and Vite)

## What it is

Vitest is a **test runner** for JavaScript and TypeScript. A test is a small program that calls your code and checks the answer. A test runner finds those programs, runs them, and prints which passed and which failed.

You write a test as a function with a name:

```ts
it("keeps an ordinary title as it is", () => {
  expect(sanitizeTitle("Build fails on Windows")).toBe("Build fails on Windows");
});
```

`it(name, function)` declares one test. `describe(name, function)` groups tests. `expect(actual).toBe(expected)` is an **assertion**: if the two differ, the test fails. Vitest runs on top of **Vite**, a build tool that understands TypeScript directly, so you do not compile the tests first.

**Coverage** answers "which lines of my code did the tests actually run?". `@vitest/coverage-v8` collects it using the counters built into V8, the JavaScript engine in Node.

## Why this repository uses it

Security tooling that is wrong is worse than none, so the parts that decide things (the workflow linter, the result validator, the trust policy model) are tested hard: 90 tests in 10 files, with a coverage threshold that fails the build if it drops. Vitest also runs the end-to-end test that starts the real program.

## Where it appears

| Path | What it does |
| --- | --- |
| `vitest.config.ts` | Where tests live, the timeout, the coverage rules. |
| `tests/unit/` | Tests of one function or class: `greeting`, `greet-issue`, `cli`. |
| `tests/integration/stream-notifier.test.ts` | The notifier against a real Node stream. |
| `tests/e2e/greeter-process.test.ts` | Compiles the program and runs it as a child process. |
| `tests/pipeline/` | Tests of `build-result`, `github-comments`, `harden-lint`, `trust-policy`, and `checklist` (checks the docs). |
| `package.json`, `Makefile`, `ci.yml`, `pr-build.yml` | `vitest run --coverage` through `npm test` / `make test`. |

## How it works underneath

1. Vitest reads `vitest.config.ts` and finds files that match `include`.
2. It runs each test file in its own worker (a separate thread or process), so tests in different files cannot disturb each other. Files run in parallel; tests inside a file run one after another.
3. Vite transforms each TypeScript file to JavaScript in memory (it erases types; it does **not** type-check; that is `tsc`'s job).
4. Every `it` function runs. An exception (including a failed `expect`) marks it failed.
5. With coverage on, V8 records which code ranges ran. The `v8` provider turns that into per-file percentages of **statements**, **branches** (each side of an `if`, `?:`, `&&`), **functions**, and **lines**.
6. If a percentage is below a configured threshold, the command exits non-zero even though all tests passed.

`vitest run` means "run once and exit". Plain `vitest` stays open and re-runs on file changes (watch mode), which is wrong for CI.

## Walkthrough of this repository's use

```ts
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
```

`defineConfig` only helps the editor with types. `include` is a glob: every file ending `.test.ts` under `tests/`. `testTimeout: 30_000` is 30 seconds per test (the default is 5); the comment explains that the e2e test compiles TypeScript and starts a process, which can be slow on a busy laptop or runner. Numbers may use `_` for readability.

```ts
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "pipeline/**/*.ts"],
      exclude: ["src/main.ts", "pipeline/*-cli.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 },
    },
```

Measure only `src` and `pipeline`. Leave out `src/main.ts` and the `-cli.ts` wrappers, which are thin and exercised by the end-to-end test in another process (coverage cannot see inside a child process). `reporter: ["text", "lcov"]` prints a table and also writes `coverage/lcov.info` (a format other tools read). The thresholds are 95 percent for lines, functions and statements and 90 percent for branches; if any is lower the run fails. At the time of writing the totals were 100 percent lines, 99.04 percent statements, 95.74 percent functions and 94.26 percent branches.

How the tests are shaped:

- **Unit** (`greeting.test.ts`): `it.each(["", "-leading", "has space", "a".repeat(40), "semi;colon", "$(id)"])("rejects the author %j", ...)` runs the same test for each bad author name.
- **Faking the outside world** (`cli.test.ts`, `github-comments.test.ts`): `main` takes fake `stdout`/`stderr` objects that collect writes in arrays; the GitHub client takes a fake `fetchFn` that returns scripted answers, and a fake `sleep` so the retry delays take no real time.
- **Integration** (`stream-notifier.test.ts`): a real `PassThrough` stream from `node:stream`.
- **End to end** (`greeter-process.test.ts`): `beforeAll` compiles the program with `tsc -p tsconfig.build.json --outDir <temp>`, writes `{ "type": "module" }` there, and each test runs `node main.js` with chosen environment variables, checking stdout, stderr and the exit code. It compiles itself rather than calling `npm run build` because the lab replaces `build` with the fork's script.
- **Linting the docs** (`checklist.test.ts`): reads `docs/review-checklist.md`, extracts every `` `exploit/vulnerable/x.yml:LINE` `` it names, and asserts that the workflow linter really reports a finding on that line. So the documentation cannot drift away from the code.

## Try it yourself

1. `npx vitest --version` prints `vitest/5.0.5 ...`.
2. `npx vitest run --coverage` ends with `Test Files  10 passed (10)`, `Tests  90 passed (90)` and a coverage table.
3. `npx vitest run tests/unit/greeting.test.ts` runs one file.
4. `npx vitest run -t "rejects the author"` runs only tests whose name contains the text.
5. Temporarily change a threshold in `vitest.config.ts` to `lines: 101`, run `npx vitest run --coverage; echo $?`, see an error about the threshold and a non-zero code, then undo the change.

## Mistakes people make

- Running plain `vitest` in CI, which waits forever in watch mode.
- Assuming Vitest checks types. It does not; `npm run typecheck` does.
- Chasing 100 percent coverage with tests that assert nothing.
- Tests that depend on the order or on shared state.
- Real network calls or real sleeps in unit tests.

## Check yourself

1. What does `expect(a).toBe(b)` do when they differ? *(Throws, so the test fails.)*
2. Why are `-cli.ts` files excluded from coverage? *(They are covered by running the program as a separate process, which coverage cannot see.)*
3. What makes `vitest run --coverage` fail even if every test passes? *(A percentage below its threshold.)*
4. Why is the e2e test's timeout longer? *(It compiles and starts a process.)*
5. What does `checklist.test.ts` protect? *(That the lines named in the review checklist are really flagged by the linter.)*

## Further reading

- Vitest guide: https://vitest.dev/guide/
- Coverage: https://vitest.dev/guide/coverage
- Configuration reference: https://vitest.dev/config/
- Vite: https://vite.dev/guide/
