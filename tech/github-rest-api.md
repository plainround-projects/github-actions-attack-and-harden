# The GitHub REST API

## What it is

GitHub exposes almost everything you can do on its website as a web service you can call from a program. This is the **REST API**. You send an HTTP request to an address (a **URL**) on `https://api.github.com` and get a JSON answer.

Words:

- **HTTP method**: the kind of request. `GET` reads, `POST` creates, `PATCH` changes part of something, `PUT` replaces, `DELETE` removes.
- **Header**: extra information on a request, such as who you are (`Authorization`).
- **Status code**: a number in the answer. `2xx` means success, `4xx` means the request was wrong (401 not signed in, 403 forbidden, 404 not found, 422 bad data), `5xx` means GitHub had a problem.
- **Token**: the credential. In a workflow it is `${{ github.token }}` (the same value as `secrets.GITHUB_TOKEN`), limited by the job's `permissions`.

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **API**: Application programming interface: a set of requests a program can send to another program or service, with documented answers. A web API is called over the internet with HTTP.
- **HTTP**: The protocol (agreed rules) that web browsers and servers use to talk. A request names a **method** (`GET` to read, `POST` to create, `PATCH` to change part, `PUT` to replace, `DELETE` to remove) and an address; the answer carries a **status code** (200 means success, 404 not found, 500 server problem).
- **JSON**: A plain-text format for structured data: objects `{ "name": "value" }`, lists `[1, 2]`, texts in double quotes, numbers, `true`, `false`, `null`. It has no comments.
- **Markdown**: A plain-text way to write formatted documents: `#` for headings, `-` for bullets, backticks for code, `|` for tables.
- **function**: A named piece of code that takes inputs (parameters), does something, and may return a result.
- **class**: A blueprint for objects: it bundles data and the functions that work on it. `new Name(...)` or `Name(...)` makes an object from it.
- **version**: A number such as `1.2.3` that names one release of software (major.minor.patch).
- **test**: A small program that uses your code and checks that the answer is the one you expected.

</details>

<!-- /words -->

## Why this repository uses it

After a pull request is built (with no privileges), `pr-report.yml` has to tell the author the result. Posting a comment is an API call. The code is small and written from scratch in `pipeline/github-comments.ts` so every part is visible: how it authenticates, what it sends, how it retries, and what it refuses.

The helper script `scripts/github-settings.sh` also uses the API, through the `gh` command (see `gh-cli.md`), to change repository settings.

## Where it appears

| Path | What it does |
| --- | --- |
| `pipeline/github-comments.ts` | `GitHubComments` class and `upsertComment`. |
| `pipeline/post-result-cli.ts` | Reads `GITHUB_TOKEN` and `GITHUB_REPOSITORY` and posts. |
| `.github/workflows/pr-report.yml` | Provides the token with `pull-requests: write`. |
| `scripts/github-settings.sh` | `gh api -X PUT repos/.../actions/permissions/...`. |
| `tests/pipeline/github-comments.test.ts` | Tests with a fake `fetch`. |

## How it works underneath

A comment on a pull request is stored as an *issue comment* (pull requests are a kind of issue). The calls used:

| Purpose | Request |
| --- | --- |
| List comments | `GET /repos/{owner}/{repo}/issues/{number}/comments?per_page=100` |
| Create a comment | `POST /repos/{owner}/{repo}/issues/{number}/comments` with body `{"body": "..."}` |
| Edit a comment | `PATCH /repos/{owner}/{repo}/issues/comments/{id}` with body `{"body": "..."}` |

Every request carries `Authorization: Bearer TOKEN`, `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28` (fixes the behaviour to that dated version). To write comments the token needs the `pull-requests: write` scope (the comment is on a pull request).

Network calls fail in ordinary ways: slow connection, dropped packet, GitHub restarting. Good clients **time out** instead of waiting forever and **retry with exponential backoff**: wait 0.5 s, then 1 s, then 2 s, so a struggling server is not hammered. They do not retry a 4xx answer, because sending the same wrong request again cannot fix it.

## Walkthrough of this repository's use

```ts
const response = await this.fetchFn(`${this.baseUrl}${path}`, init);
if (response.ok) return response;
throw new HttpError(response.status, `GitHub answered ${response.status} to ${method} ${path}`);
```

`fetch` is Node's built-in web-request function. `response.ok` is true for 2xx. Otherwise an `HttpError` carrying the status is thrown. Note the message contains the method and path but **never the token**.

```ts
headers: {
  Authorization: `Bearer ${this.options.token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
},
signal: AbortSignal.timeout(this.timeoutMs),
```

The spread `...(cond ? {} : {...})` adds the `Content-Type` header only when there is a body. `AbortSignal.timeout(10_000)` cancels the request after ten seconds.

```ts
if (error instanceof HttpError && error.status < 500) throw error;
lastError = error;
...
if (attempt < this.attempts) await this.sleep(2 ** (attempt - 1) * 500);
```

A 4xx error is rethrown at once. Anything else (network error, timeout, 5xx) is remembered and retried; `2 ** (attempt - 1) * 500` is 500, then 1000 milliseconds. After three attempts the last error is thrown. Both `fetchFn` and `sleep` can be replaced, which is how the tests run instantly with scripted answers.

```ts
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error(`not a repository name: ${JSON.stringify(repository.slice(0, 80))}`);
}
const existing = (await api.list(repository, pr)).find((comment) => comment.body.startsWith(COMMENT_MARKER));
```

The repository name is validated before it goes into a URL (a test passes `o/r/../../x` and expects a refusal), and the first line of the comment, `<!-- pr-report -->`, marks it as ours so a re-run edits it instead of adding another. In Markdown that line is an HTML comment, invisible to readers.

## Try it yourself

1. `npx vitest run tests/pipeline/github-comments.test.ts` runs the tests (no network needed).
2. `grep -n "api.github.com" pipeline/github-comments.ts` shows the only host the code ever calls.
3. `GITHUB_TOKEN= npx tsx pipeline/post-result-cli.ts x.json; echo $?` prints the usage line and `2` (the token is empty).
4. With the GitHub CLI signed in: `gh api repos/cli/cli/issues/1/comments --jq 'length'` makes a real `GET` and prints a number.
5. `curl -s https://api.github.com/zen` returns a short random proverb from GitHub (no sign-in needed, no side effects).

## Mistakes people make

- Retrying every error, including 4xx.
- Calling with no timeout.
- Printing the whole request (with the token) into a log.
- Putting an unvalidated repository name or number into a URL.
- Assuming a comment list is complete: `per_page=100` returns at most 100 comments; a pull request with more would need paging.

## Check yourself

1. What does a 404 tell you? *(The address or object does not exist; retrying will not help.)*
2. Why exponential backoff? *(Waiting longer each time avoids overloading a struggling server.)*
3. Why does the token never appear in an error message? *(Logs are readable by many people.)*
4. Why a marker line in the comment? *(So a rerun finds and updates the earlier comment.)*
5. What scope does posting need? *(`pull-requests: write`.)*

## Further reading

- GitHub REST API documentation: https://docs.github.com/en/rest
- Issue comments: https://docs.github.com/en/rest/issues/comments
- MDN, `fetch`: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
- HTTP status codes: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
