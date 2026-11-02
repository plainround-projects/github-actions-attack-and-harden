# ESLint (with typescript-eslint and @eslint/js)

## What it is

ESLint is a **linter** for JavaScript and TypeScript. A linter reads your source code without running it and reports patterns that are probably mistakes or against your team's rules: a variable never used, an `==` where `===` was meant, a forbidden import. It does not change what the code means, and it does not check formatting (that is Prettier's job here).

Terms:

- **Rule**: one check, with an id such as `no-restricted-imports`. Each rule is set to `"off"`, `"warn"` or `"error"`.
- **Config**: the file (`eslint.config.js`) that says which rules apply to which files. It is a list of objects; later objects override earlier ones for the files they match.
- **Preset** ("recommended", "strict"): a ready-made bundle of rules.
- **typescript-eslint**: a plugin that lets ESLint read TypeScript and adds TypeScript-specific rules.
- **`@eslint/js`**: ESLint's own recommended JavaScript rules.

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **command line**: The text you type after the prompt in a terminal to run a program, such as `npm test`. The words after the program name are its **arguments**; words that start with `-` or `--` are **options** (also called flags).
- **glob**: A pattern for file names with wildcards: `*` matches any characters inside one name, `**` matches across folders, `?` matches one character. `src/**/*.ts` means every `.ts` file below `src`.
- **regular expression**: A compact pattern that describes text, such as `^[0-9]{12}$` (exactly twelve digits). Tools use them to find or check text. Often shortened to **regex**.
- **repository**: A project's folder of files together with its complete history of changes. On GitHub, a repository is a page with those files, issues and pull requests.
- **CI**: Continuous integration: running checks (build, tests, linters) automatically every time code changes.
- **package**: A bundle of code someone published for others to use, installed by a package manager such as npm or pip.
- **function**: A named piece of code that takes inputs (parameters), does something, and may return a result.
- **variable**: A name for a place that holds a value which can be used later in the code.
- **array**: An ordered list of values.
- **folder**: A container for files and other folders on disk (also called a directory).

</details>

<!-- /words -->

## Why this repository uses it

Two reasons. First, ordinary code hygiene. Second, and more interesting, the layer rules of the application are written as lint rules: the domain code may not import from infrastructure, application code may not import from infrastructure, interfaces or the pipeline tools, infrastructure code may not import from interfaces or the pipeline tools, the command-line layer may not import from the pipeline tools, and the pipeline tools may not import from `src`. A wrong import fails the build instead of waiting for a reviewer to notice.

## Where it appears

| Path | What it does |
| --- | --- |
| `eslint.config.js` | The configuration. |
| `package.json` | `"lint": "eslint . && prettier --check ."`, plus the packages `eslint`, `@eslint/js`, `typescript-eslint`. |
| `Makefile` | `make lint` runs `npx eslint .`. |
| `.github/workflows/ci.yml` | Job `app` runs `npm run lint`. |
| `src/domain/greeting.ts` | Contains the one allowed suppression comment. |

## How it works underneath

1. ESLint finds the files to check: everything under the current folder, except those matched by an `ignores` entry.
2. For each file it asks the parser to build a **syntax tree** (a structured picture of the code). `typescript-eslint` supplies the parser for `.ts`.
3. It walks the tree. Each active rule is a small program that watches for certain kinds of node (an import, a function call) and reports a problem with a position and message.
4. It prints the problems. The exit code is 1 if any rule set to `error` fired, 0 otherwise.

In the "flat config" format used here, the config file exports an array. For a given file ESLint combines every array entry whose `files` pattern matches (entries without `files` match everything), in order.

## Walkthrough of this repository's use

```js
export default tseslint.config(
  { ignores: ["dist/", "build/", "coverage/", "node_modules/", "exploit/", "infra/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
```

`tseslint.config(...)` combines entries. The first is an object with only `ignores`: skip compiled output, the lab's deliberately odd files in `exploit/`, and `infra/`. Then ESLint's recommended JavaScript rules, then typescript-eslint's `strict` preset (which includes the recommended set plus stricter ones such as no non-null assertions and no useless constructors).

```js
const forbid = (layers) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: layers.map((layer) => ({
        group: [`**/${layer}/**`, `**/${layer}.js`],
        message: `This layer must not import from ${layer}.`,
      })),
    },
  ],
});
```

`forbid` is a helper that builds a rules object. `no-restricted-imports` is a built-in rule that fails on imports matching given patterns. `group` takes glob patterns: any path containing a folder named like the layer, or a file named `layer.js`. `layers.map(...)` makes one pattern per forbidden layer, each with its own message.

```js
  { files: ["src/domain/**/*.ts"],         rules: forbid(["application", "infrastructure", "interfaces", "pipeline"]) },
  { files: ["src/application/**/*.ts"],    rules: forbid(["infrastructure", "interfaces", "pipeline"]) },
  { files: ["src/infrastructure/**/*.ts"], rules: forbid(["interfaces", "pipeline"]) },
  { files: ["src/interfaces/**/*.ts", "src/main.ts"], rules: forbid(["pipeline"]) },
  { files: ["pipeline/**/*.ts"],           rules: forbid(["src"]) },
```

(The file lays these out over several lines; the content is the same.) Read it as a ladder: the **domain** (business rules) may import from nobody; **application** may import the domain only; **infrastructure** may import domain and application; **interfaces** (the command line) may import all of `src` but not `pipeline`; and `pipeline/` (CI tooling) may not import from `src` at all. The point is that the CI tools and the app cannot grow tangled.

In `src/domain/greeting.ts`:

```ts
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
```

The base rule `no-control-regex` complains about control characters inside a regular expression, which is exactly what this expression is for. The comment disables that one rule for the next line only and says why after `--`. It is the only suppression in the code.

<!-- walk:eslint.config.js -->
### `eslint.config.js`, line by line

Lines 1 to 3:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
```

The imports: `js` is the package `@eslint/js` (ESLint's own recommended rules) and `tseslint` is `typescript-eslint`.

Lines 4 to 19:

```js
/** Folders of src/ and what each may import: domain imports nothing; application the domain; nothing imports interfaces. */
const forbid = (layers) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: layers.map((layer) => ({
        group: [`**/${layer}/**`, `**/${layer}.js`],
        message: `This layer must not import from ${layer}.`,
      })),
    },
  ],
});

export default tseslint.config(
  { ignores: ["dist/", "build/", "coverage/", "node_modules/", "exploit/", "infra/"] },
  js.configs.recommended,
```

The helper `forbid(layers)` and the start of the exported configuration; explained in the walkthrough above. The first object in the list is `{ ignores: [...] }`, which names the folders ESLint must skip.

Lines 20 to 41:

```js
  ...tseslint.configs.strict,
  {
    files: ["src/domain/**/*.ts"],
    rules: forbid(["application", "infrastructure", "interfaces", "pipeline"]),
  },
  {
    files: ["src/application/**/*.ts"],
    rules: forbid(["infrastructure", "interfaces", "pipeline"]),
  },
  {
    files: ["src/infrastructure/**/*.ts"],
    rules: forbid(["interfaces", "pipeline"]),
  },
  {
    files: ["src/interfaces/**/*.ts", "src/main.ts"],
    rules: forbid(["pipeline"]),
  },
  {
    files: ["pipeline/**/*.ts"],
    rules: forbid(["src"]),
  },
);
```

The preset `tseslint.configs.strict`, spread into the list with `...`, and the five objects that attach the import bans to folders. Each object has `files` (which files it applies to) and `rules` (the result of `forbid([...])`). For `src/domain/**/*.ts` the banned layers are application, infrastructure, interfaces and pipeline; for `src/application/**` infrastructure, interfaces and pipeline; for `src/infrastructure/**` interfaces and pipeline; for `src/interfaces/**` and `src/main.ts` pipeline; for `pipeline/**` the folder `src`.

<!-- /walk:eslint.config.js -->

## Try it yourself

1. `npx eslint --version` prints `v10.13.0`.
2. `npx eslint .` prints nothing and exits 0.
3. Add the line `import { StreamNotifier } from "../infrastructure/stream-notifier.js";` at the top of `src/domain/greeting.ts` and run `npx eslint src/domain/greeting.ts`. Expected: an `error` ending `This layer must not import from infrastructure` (rule `no-restricted-imports`), plus a second one saying `StreamNotifier` is defined but never used. Remove the line afterwards (`git checkout src/domain/greeting.ts`).
4. `npx eslint --print-config src/domain/greeting.ts | grep -A3 no-restricted-imports` shows the rule as it applies to that file.
5. `grep -rn "eslint-disable" src pipeline tests` lists every suppression (one).

## Mistakes people make

- Disabling a rule for a whole file when one line needs it.
- Expecting ESLint to fix formatting; use Prettier for that.
- Putting `ignores` in the same object as `rules`: in flat config, an object with only `ignores` is global, otherwise it applies just to that entry.
- Treating warnings as harmless; here every rule is `error` so CI fails.

## Check yourself

1. What does a linter not do? *(Run your program or change its meaning.)*
2. What does `forbid(["infrastructure"])` do? *(Makes any import from an infrastructure path an error for the files it is applied to.)*
3. Why does `pipeline/` forbid `src`? *(CI tools must not depend on the application they check.)*
4. What does `-- stripping control characters is the point` do? *(Gives the reason for the suppression.)*
5. Why is `exploit/` ignored? *(Those files are deliberately unsafe lab material, not code to lint.)*

## Further reading

- ESLint 10 documentation: https://eslint.org/docs/latest/
- Flat config: https://eslint.org/docs/latest/use/configure/configuration-files
- `no-restricted-imports`: https://eslint.org/docs/latest/rules/no-restricted-imports
- typescript-eslint: https://typescript-eslint.io/
