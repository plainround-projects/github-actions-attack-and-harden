# jq

## What it is

jq is a command-line tool that reads JSON text, picks parts out of it, and prints the result. Think of it as a small language for filtering JSON, the way `grep` filters lines of text. It is preinstalled on GitHub's Ubuntu runners.

## Why this repository uses it

`pr-build.yml` must write a small JSON file, `result.json`, containing a pull request number, a commit hash and an outcome. The values come from an event that a stranger started. Building that JSON by gluing strings together would let a quote or a newline in a value break out of its field. `jq` builds the JSON itself and encodes every value correctly. The Docker image for `act` also installs `jq` so the same step runs locally.

## Where it appears

| Path | What it does |
| --- | --- |
| `.github/workflows/pr-build.yml` | Step "Record the result for pr-report": `jq -n ... > result.json`. |
| `ci/act-runner/Dockerfile` | `jq` is among the packages installed with `apt-get`. |
| `tech/aws-iam.md`, `tech/json.md` | Use it in the "Try it yourself" examples. |

## How it works underneath

jq reads JSON from standard input, applies a **filter** (the quoted program) and writes results to standard output. `.` means "the whole input"; `keys` returns the names of an object's fields; `[]` iterates over a list; `+` joins text; `|` sends one filter's output into the next. `-r` ("raw") prints text without JSON quotes.

## Walkthrough of this repository's use

```bash
jq -n --argjson pr "$PR_NUMBER" --arg sha "$HEAD_SHA" --arg conclusion "$JOB_STATUS" \
  '{pr: $pr, sha: $sha, conclusion: $conclusion}' > result.json
```

- `jq -n`: start with no input (`null`); we are creating JSON, not reading it.
- `--argjson pr "$PR_NUMBER"`: define a jq variable `$pr` whose value is parsed as **JSON**, so `3` becomes the number 3, not the text `"3"`. If `PR_NUMBER` were not valid JSON, jq would stop with an error.
- `--arg sha "$HEAD_SHA"`: define `$sha` as a **string**, exactly as given. Quotes, backslashes and newlines are escaped for us.
- `--arg conclusion "$JOB_STATUS"`: the job's status (`success`, `failure`, `cancelled`) as a string.
- `'{pr: $pr, sha: $sha, conclusion: $conclusion}'`: the **filter**, here an object whose fields are those variables. The single quotes keep the shell from touching `$pr` and `$sha`; jq, not the shell, replaces them.
- `\` at the end of a line continues the command on the next line. `> result.json` writes the output to the file.

The three shell variables are set by `env:` on the step. Their values never appear in the script text, which is the same rule as for the `greet.yml` fix. The next stage, `pipeline/build-result.ts`, still checks every field, because even a well-formed file came from a job that ran untrusted code.

Result for a successful run:

```json
{
  "pr": 3,
  "sha": "0000000000000000000000000000000000000000",
  "conclusion": "success"
}
```

jq prints in an indented form by default.

## Try it yourself

1. `jq --version` prints the version (this was checked with 1.6).
2. `jq -n --argjson pr 3 --arg sha 0123456789abcdef0123456789abcdef01234567 --arg conclusion success '{pr: $pr, sha: $sha, conclusion: $conclusion}'` prints the three-field object.
3. `jq -n --arg conclusion 'x"; echo hi' '{conclusion: $conclusion}'` prints `"conclusion": "x\"; echo hi"`: the quote is escaped, the structure is intact.
4. `jq -n --argjson pr notjson '{pr: $pr}'; echo $?` prints `jq: invalid JSON text passed to --argjson` and `2`.
5. `jq .issue.title exploit/events/issue-injection.json` reads a value from a file, printing the title as a JSON string with `\"` escapes.

## Mistakes people make

- Building JSON with `echo "{\"pr\": $PR}"`; one odd value breaks it or injects fields.
- Using `--arg` for a number and getting a string.
- Double-quoting the filter, so the shell replaces `$pr` before jq sees it.
- Forgetting `-r` when you want raw text without JSON quotes.
- Assuming jq validates the meaning of values; it only keeps the JSON well formed.

## Check yourself

1. What does `-n` do? *(Starts with no input; used to build new JSON.)*
2. `--arg` versus `--argjson`? *(`--arg` always gives a string; `--argjson` parses its value as JSON, so numbers stay numbers.)*
3. Why are the values passed through `env:` and not pasted? *(So GitHub does not paste event text into the script.)*
4. Why is the filter in single quotes? *(So the shell leaves `$pr` for jq.)*
5. Why does `pr-report` still validate the file? *(It came from a job that ran a stranger's code.)*

## Further reading

- jq manual: https://jqlang.org/manual/
