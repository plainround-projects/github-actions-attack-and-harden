# The `yaml` package (YAML parser for JavaScript)

## What it is

`yaml` is an npm package that reads and writes YAML files from JavaScript or TypeScript. (YAML itself, the format, has its own note: `yaml.md`.) Given the text of a workflow file, it can give you either:

- **plain data** (`document.toJS()`): objects, arrays, strings, numbers, booleans, as if you had written the file as JSON; or
- a **document** with a syntax tree that remembers where each piece sat in the text: which character, which line.

Position matters for a linter. A message such as `greet.yml:14: error ...` is only useful if it names the line.

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **regular expression**: A compact pattern that describes text, such as `^[0-9]{12}$` (exactly twelve digits). Tools use them to find or check text. Often shortened to **regex**.
- **repository**: A project's folder of files together with its complete history of changes. On GitHub, a repository is a page with those files, issues and pull requests.
- **workflow**: A GitHub Actions automation described in a YAML file under `.github/workflows/`. It names the events that start it and the jobs it runs.
- **JSON**: A plain-text format for structured data: objects `{ "name": "value" }`, lists `[1, 2]`, texts in double quotes, numbers, `true`, `false`, `null`. It has no comments.
- **package**: A bundle of code someone published for others to use, installed by a package manager such as npm or pip.
- **string**: A piece of text in a program.

</details>

<!-- /words -->

## Why this repository uses it

`pipeline/harden-lint.ts` must understand workflow files to find unsafe patterns. Reading them with a regular expression would be fragile (`on:` can be a string, a list or a map; `permissions` can be a word or a table). A real parser gives the same structure GitHub sees, and the tree gives line numbers for the findings.

## Where it appears

| Path | What it does |
| --- | --- |
| `package.json` | `"yaml": "2.9.1"` in `devDependencies`. |
| `pipeline/harden-lint.ts` | `import { LineCounter, parseDocument, type Document, type Node } from "yaml";` |
| `tests/pipeline/harden-lint.test.ts` | Feeds many small workflows to the linter. |

## How it works underneath

`parseDocument(text, options)` runs three stages:

1. **Lexing and parsing**: the text becomes a tree of nodes (maps, sequences, scalars). Each node has a `range` of three numbers: where it starts, where its value ends, where the node ends, counted in characters from the start of the file.
2. **Resolution**: plain scalars get a type by the rules of the YAML **schema**. This package defaults to YAML 1.2, in which `on` is just a string. (YAML 1.1 treated `on`, `yes` and `no` as booleans; that surprises people reading `on:` keys.)
3. **Errors and warnings** are collected on the document rather than thrown, so one bad file does not stop the whole run unless you look.

A `LineCounter` records where each line starts, so `lineCounter.linePos(offset)` turns a character offset into `{ line, col }`.

## Walkthrough of this repository's use

```ts
const lineCounter = new LineCounter();
const document: Document = parseDocument(text, { lineCounter });
// YAML 1.1 reads the key `on` as the boolean true; the yaml package keeps it as the string "on".
const workflow = asMapping(document.toJS() as Json);
```

Create a line counter, parse with it, and convert to plain data. `workflow["on"]` therefore works as expected. `asMapping` returns `{}` if the value is not an object, so the linter never crashes on an odd file.

```ts
const lineOf = (path: Path): number => {
  const node = document.getIn(path, true) as Node | null | undefined;
  return lineCounter.linePos(node?.range?.[0] ?? 0).line;
};
```

`getIn(["jobs", "greet", "steps", 0, "run"], true)` walks the tree along a path of keys and indexes. The second argument `true` asks for the node itself (not its value). Its `range[0]` is the start offset, and `linePos` converts that to a line number. If a path is not found, the finding falls back to line 1.

Where the path points matters for the reader. For the injection rule the path ends in `run`, so the line is where that script starts; for `persist-credentials` it points at `with` if it exists, otherwise at the `uses` line.

Every finding then carries `{ rule, severity, file, line, job, message }` and is printed as `file:line: severity [rule] message (job NAME)`.

The `Json` type in the linter is a hand-written description of what `toJS()` can return (`null | boolean | number | string | arrays | objects`), so the rest of the code can be strictly typed (see `typescript.md`).

## Try it yourself

1. `node -e "const {parse}=require('yaml'); console.log(parse('on: push'))"` prints `{ on: 'push' }` (the key is a string).
2. `node -e "const {parseDocument}=require('yaml'); const d=parseDocument('a: 1\nb: [x'); console.log(d.errors.length>0)"` prints `true` (the broken flow list is reported, not thrown).
3. `npx tsx pipeline/harden-lint-cli.ts exploit/vulnerable/.github/workflows/greet.yml` prints two findings with the line numbers 12 and 14.
4. `sed -n 14p exploit/vulnerable/.github/workflows/greet.yml` shows `      - run: |`, the line where the script the linter flagged begins.
5. `npx vitest run tests/pipeline/harden-lint.test.ts` runs the linter's tests.

## Mistakes people make

- Parsing YAML with regular expressions.
- Expecting `on` to be a boolean (that is YAML 1.1; this package uses 1.2).
- Ignoring `document.errors`: a file that fails to parse can still return partial data.
- Believing line numbers count from 0; `linePos` counts from 1.

## Check yourself

1. What does `toJS()` return? *(Plain JavaScript data without positions.)*
2. Why use a `LineCounter`? *(To turn character offsets into line numbers.)*
3. What does `getIn(path, true)` return? *(The node itself, so its `range` is available.)*
4. Why is `workflow["on"]` safe here? *(YAML 1.2 keeps `on` as a string.)*
5. What happens to a syntax error? *(It is stored in `document.errors`.)*

## Further reading

- `yaml` package documentation: https://eemeli.org/yaml/
- YAML 1.2 specification: https://yaml.org/spec/1.2.2/
