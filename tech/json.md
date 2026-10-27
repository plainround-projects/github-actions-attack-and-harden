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
