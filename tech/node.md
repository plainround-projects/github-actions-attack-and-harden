# Node.js

## What it is

Node.js is a program that runs JavaScript outside a web browser. A browser can run JavaScript to make a page interactive; Node lets the same language read files, start other programs, make web requests and run a server. It is built on **V8**, the JavaScript engine from Chrome, plus a library of built-in modules for the operating system.

You use it by typing `node file.js`. Node reads the file, compiles it in memory, runs it from top to bottom, then keeps running only as long as something is still waiting (a timer, a network call). When nothing is left, it exits with an **exit code**: `0` for success, anything else for failure.

## Why this repository uses it

Everything in the repository is TypeScript, and TypeScript runs on Node. The greeter program, the test runner, the linters, the formatters and the pipeline tools are all Node programs. The `engines` field in `package.json` says `"node": ">=22.12"`, and the workflows install Node 22 with `actions/setup-node`.

## Where it appears

| Path | What it does with Node |
| --- | --- |
| `package.json` | `"type": "module"`, `"engines": { "node": ">=22.12" }`. |
| `src/main.ts` | The entry point; sets `process.exitCode`. |
| `pipeline/*.ts` | Use `node:fs`, `node:path`, global `fetch`, `AbortSignal.timeout`, `process.argv`, `process.env`. |
| `tests/e2e/greeter-process.test.ts` | Starts a real Node process with `spawnSync(process.execPath, ...)`. |
| `exploit/fork/apply-fork-change.mjs` | A plain Node script that edits a `package.json`. |
| `.github/workflows/*.yml` | `actions/setup-node` with `node-version: "22"` and `cache: npm`. |
| `ci/act-runner/Dockerfile` | Downloads Node 22.12.0 into the image that `act` uses. |

## How it works underneath

### Two module systems

Old Node files used `require(...)`. Modern files use `import ... from ...`, called **ES modules**. A file is read as an ES module when `package.json` says `"type": "module"` (this repository) or when the file ends in `.mjs`. In an ES module:

- There is no `__dirname`; use `import.meta.dirname` (the e2e test does).
- Relative imports must include the file extension.
- `await` can be used at the top level (`pipeline/post-result-cli.ts` does this).

### Built-in modules and the `node:` prefix

`import { readFileSync } from "node:fs"` loads Node's file-system module. The `node:` prefix says "this is built in, not from `node_modules`". Others used here: `node:path` (join file names correctly), `node:os` (`tmpdir()`), `node:child_process` (`spawnSync` starts another program).

### Globals

- `process.argv`: the command line. `process.argv[0]` is Node, `[1]` the script, so `process.argv.slice(2)` are your arguments.
- `process.env`: the environment variables, an object of strings.
- `process.stdout` / `process.stderr`: the output streams. Normal output goes to stdout, problems to stderr.
- `process.exitCode`: the number the process exits with when it ends naturally. `process.exit(n)` ends immediately.
- `fetch`: the web-request function (built in since Node 18).
- `AbortSignal.timeout(ms)`: a signal that fires after the time, used to cancel a slow request.

### Exit codes are the language of CI

A step in a workflow passes if the program exits `0`. Every CLI in this repository picks its exit code on purpose: `harden-lint-cli.ts` exits 1 when it finds anything, `check-trust-cli.ts` exits 1 if any scenario differs, `src/main.ts` exits 0, 1 or 2.

## Walkthrough of this repository's use

```ts
process.exitCode = main({ env: process.env, stdout: process.stdout, stderr: process.stderr });
```

(`src/main.ts`, the whole file after its import.) The program's logic is a function `main(io)` that takes its inputs as parameters instead of reaching for globals, so a test can call it with fake streams. This line is the only place that touches the real `process`. Setting `exitCode` (instead of calling `process.exit`) lets output finish flushing first.

```ts
const [file] = process.argv.slice(2);
const token = process.env["GITHUB_TOKEN"];
if (!file || !token || !repository) { console.error("usage: ..."); process.exit(2); }
```

(`pipeline/post-result-cli.ts`.) Take the first argument, read two variables, print a usage message and exit with 2 if one is missing. `process.env["GITHUB_TOKEN"]` uses brackets because of `noUncheckedIndexedAccess` (see `typescript.md`).

```ts
spawnSync(process.execPath, [join(outDir, "main.js")], {
  env: { PATH: process.env["PATH"] ?? "", ...env },
  encoding: "utf8",
  timeout: 20_000,
});
```

(`tests/e2e/greeter-process.test.ts`.) `process.execPath` is the path of the Node program that is running the test, so the test uses the same Node. The child gets a clean environment: only `PATH` plus the variables the test sets. This is how the program is really invoked in the workflow, only with the secrets absent. `timeout` kills it after 20 seconds.

```js
const pkg = JSON.parse(readFileSync(file, "utf8"));
pkg.scripts.build = 'node -e "console.log(\'FORK CODE RAN: event=\' + process.env.GITHUB_EVENT_NAME + ...)"';
writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
```

(`exploit/fork/apply-fork-change.mjs`.) Reads a `package.json`, replaces its `build` script with one that prints the event name and whether a variable *named* `DEPLOY_TOKEN` exists (`'DEPLOY_TOKEN' in process.env`: it asks for the name, never the value), and writes the file back with two-space indentation. `node -e "..."` runs a one-line program given on the command line. This stands in for "what the stranger's pull request changes".

In the Dockerfile, Node is fetched from `nodejs.org/dist/v22.12.0/` for the machine's CPU type and unpacked into `/usr/local`, so JavaScript-based actions and `npm` work inside the `act` image.

<!-- walk:exploit/fork/apply-fork-change.mjs -->
### `exploit/fork/apply-fork-change.mjs`, line by line

Lines 1 to 9:

```js
// The one change the lesson's fork pull request makes: it replaces the `build` script in package.json.
//
// `make run` applies it to a copy of the repository (never to the real files) and lets act "check out" that copy, which
// is what a checkout of the fork's head commit would put in the workspace. The new script prints which event it runs
// under and whether a variable NAMED DEPLOY_TOKEN is in its environment. It checks the name only; it never reads,
// prints or sends the value.
//
// usage: node exploit/fork/apply-fork-change.mjs PATH/TO/package.json
import { readFileSync, writeFileSync } from "node:fs";
```

A `.mjs` file is always an ES module. The comment explains what the file simulates: the change that the lesson's fork pull request makes, applied to a **copy** of the repository by `make run`. The new `build` script prints the event name and whether a variable *named* `DEPLOY_TOKEN` exists, never its value. The `import` line loads two file functions.

Lines 11 to 15:

```js
const file = process.argv[2];
if (!file) {
  console.error("usage: node apply-fork-change.mjs PATH/TO/package.json");
  process.exit(2);
}
```

`process.argv[2]` is the first argument. Without it, print a usage message to standard error and exit with code 2.

Lines 17 to 20:

```js
const pkg = JSON.parse(readFileSync(file, "utf8"));
pkg.scripts.build =
  'node -e "console.log(\'FORK CODE RAN: event=\' + process.env.GITHUB_EVENT_NAME + \' deploy-token-in-environment=\' + (\'DEPLOY_TOKEN\' in process.env))"';
writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
```

Read the `package.json` and parse it (`JSON.parse`); replace its `scripts.build` with a one-line program run by `node -e` (`-e` means "evaluate this text as a program"): it prints `FORK CODE RAN: event=` plus the event name, ` deploy-token-in-environment=` and the result of `'DEPLOY_TOKEN' in process.env`, which is `true` or `false` according to whether the variable exists. Then write the file back with two-space indentation (`JSON.stringify(pkg, null, 2)`) and a final line break.

<!-- /walk:exploit/fork/apply-fork-change.mjs -->

## Try it yourself

1. `node --version` prints your Node version. The repository needs 22.12 or newer.
2. `echo 'console.log(process.argv.slice(2))' > /tmp/args.js && node /tmp/args.js a b` prints `[ 'a', 'b' ]`. (With `node -e` there is no script file, so the arguments start one place earlier.)
3. `node -e "process.exitCode = 3"; echo $?` prints `3`.
4. `node -e "console.log('DEPLOY_TOKEN' in process.env)"` prints `false`; `DEPLOY_TOKEN=x node -e "console.log('DEPLOY_TOKEN' in process.env)"` prints `true`.
5. `node exploit/fork/apply-fork-change.mjs` (no argument) prints `usage: node apply-fork-change.mjs PATH/TO/package.json` and exits 2.

## Mistakes people make

- Mixing `require` and `import` in the same file.
- Forgetting the extension in a relative import in an ES module.
- Calling `process.exit()` right after writing a lot of output; some may be lost.
- Reading `process.env.X` and not handling the value being `undefined`.
- Assuming the Node on your laptop matches CI. `engines` and the workflow's `node-version` are there to pin it down.

## Check yourself

1. What does Node add to JavaScript? *(Access to files, processes, the network and the operating system outside a browser.)*
2. What does `"type": "module"` do? *(Treats `.js` files as ES modules.)*
3. What is an exit code of 0? *(Success; anything else is failure, which is how CI knows a step failed.)*
4. Why does `main(io)` take `env`, `stdout`, `stderr` as parameters? *(So a test can pass fakes without touching the real process.)*
5. What does `node:fs` mean? *(Node's built-in file-system module.)*

## Further reading

- Node.js 22 documentation: https://nodejs.org/docs/latest-v22.x/api/
- ES modules in Node: https://nodejs.org/docs/latest-v22.x/api/esm.html
- `process`: https://nodejs.org/docs/latest-v22.x/api/process.html
