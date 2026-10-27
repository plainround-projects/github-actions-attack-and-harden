# tsx

## What it is

`tsx` is a command that runs a TypeScript file directly: `npx tsx pipeline/harden-lint-cli.ts`. Node.js itself runs JavaScript. Normally you compile TypeScript to JavaScript with `tsc` and then run the output. `tsx` skips that step: it starts Node, and as each file is loaded it converts the TypeScript to JavaScript in memory (by erasing the types), then lets Node run it.

Two things to know:

- It does **not** check types. It only removes them. Type checking is still `tsc --noEmit`.
- The name has nothing to do with React's `.tsx` file extension, although the two look alike.

## Why this repository uses it

The tools in `pipeline/` run in CI many times a day: the workflow linter, the result poster, the trust-policy checker. Compiling them first would add a build step and a folder of generated files to every job. `tsx` runs them as they are.

## Where it appears

| Path | Command |
| --- | --- |
| `Makefile` | `npx tsx pipeline/harden-lint-cli.ts` (in `lint` and `attack-scan`), `npx tsx pipeline/check-trust-cli.ts ...` (in `check-trust`). |
| `.github/workflows/ci.yml` | Job `workflows`: `npx tsx pipeline/harden-lint-cli.ts`. |
| `.github/workflows/pr-report.yml` | `npx tsx pipeline/post-result-cli.ts result/result.json`. |
| `package.json` | `"tsx": "4.23.15"` in `devDependencies`. |

## How it works underneath

`tsx` wraps `node`. It registers a **loader** (a hook that Node calls whenever a file is imported). When Node asks for `pipeline/harden-lint.ts`, the loader reads the text, uses a very fast compiler (esbuild) to strip the types and rewrite any syntax Node does not understand, and returns the plain JavaScript. Imports that name `.js` files are mapped to the `.ts` file that exists on disk, which is why the source here can say `import ... from "./harden-lint.js"` and still run before anything is compiled.

Because nothing is written to disk, there is no `dist/` folder to go stale. The price is a small start-up cost for each run.

## Walkthrough of this repository's use

```bash
npx tsx pipeline/harden-lint-cli.ts exploit/vulnerable/.github/workflows
```

`npx` finds the `tsx` program in `node_modules/.bin`. `pipeline/harden-lint-cli.ts` is the file to run. Everything after it (the folder) is handed to the program as `process.argv`. The program lints those workflows, prints one line per finding and exits 1.

```bash
npx tsx pipeline/check-trust-cli.ts $(TF_ENV)/plan.json owner/vulnerable-demo production
```

(in the Makefile, with `TF_ENV` standing for `infra/environments/demo`.) Three arguments: the Terraform plan in JSON, the repository, and the environment name.

In `pr-report.yml` the same style of command runs in a privileged job. The code it runs comes from the default branch, because that job never checks out the pull request, and `npm ci --ignore-scripts` installed `tsx` from the locked, checksummed version.

One limit you can see in the tests: `tests/e2e/greeter-process.test.ts` does **not** use `tsx` to start the program under test. It compiles it with `tsc` and runs plain `node`, so the test exercises the program the way a built version runs. (During the lab's `act` runs, a `tsx` process also hung in the container, which is another reason the end-to-end test avoids it.)

## Try it yourself

1. `npx tsx --version` prints `tsx v4.23.15` and the Node version.
2. `npx tsx pipeline/harden-lint-cli.ts --rules` prints the eight rule ids with their descriptions, separated by a tab.
3. `echo 'const n: number = "x"; console.log("ran")' > /tmp/t.ts && npx tsx /tmp/t.ts` prints `ran`: the type error is ignored.
4. `npx tsc --noEmit --strict --ignoreConfig /tmp/t.ts` reports `Type 'string' is not assignable to type 'number'` (`--ignoreConfig` is needed because TypeScript 6 refuses to mix a file on the command line with a `tsconfig.json`). That is the difference between running and checking.
5. `npx tsx pipeline/check-trust-cli.ts` (no arguments) prints a usage line and exits 2.

## Mistakes people make

- Assuming `tsx` type-checks.
- Using it for production code where start-up time and a missing compiled artifact matter.
- Forgetting that it runs whatever is in the file, so only run files you trust.

## Check yourself

1. What does `tsx` do to the types? *(Erases them in memory; it does not check them.)*
2. Why can a `.ts` file import `"./x.js"`? *(`tsx` and the compiler map it to the real `x.ts`.)*
3. Why is `tsx` in `devDependencies`? *(It is only needed to run the CI tools, not the shipped program.)*
4. How do you check types? *(`npm run typecheck`, which runs `tsc --noEmit`.)*
5. Why does the e2e test compile with `tsc` instead? *(To run the program as the built version runs.)*

## Further reading

- tsx documentation: https://tsx.is/
- `npx`: https://docs.npmjs.com/cli/v11/commands/npx
