# YAML

## What it is

YAML is a text format for structured data: lists, named values, and nests of both. People read and write it easily and programs parse it. It is a **file format**, not a language that runs. Every workflow, action definition and Dependabot setting in this repository is YAML (`.yml`).

## Why this repository uses it

Every workflow, the labeler rules, the Dependabot configuration and the stand-in actions are YAML. The attacks themselves are partly YAML facts: the lab note in `exploit/vulnerable/.github/workflows/greet.yml` explains that the lesson's one-line `run: echo "New issue: ..."` is not even valid YAML, and the hardened workflows lean on block text and on quoting. A reader who does not know the rules cannot tell which line of a workflow is a command and which is a value.

## Where it appears

| Path | What it is |
| --- | --- |
| `.github/workflows/*.yml` | The six hardened workflows. |
| `exploit/vulnerable/.github/workflows/*.yml` | The three weak lab workflows. |
| `.github/labeler.yml` | Label rules. |
| `.github/dependabot.yml` | Update configuration. |
| `exploit/stubs/*/action.yml` | Stand-in actions for `act`. |
| `pipeline/harden-lint.ts` | Reads workflows with the `yaml` package (see `yaml-library.md`). |

## How it works underneath

A **parser** reads the text and builds a **mapping** (names with values), a **sequence** (a list) or a **scalar** (one value). Indentation shows nesting, with spaces and never tabs. `key: value` is a mapping entry, `- item` a list entry, `[a, b]` and `{x: 1}` the one-line forms, `#` starts a comment, and `|` after a key begins a **block scalar**: the indented lines below are one text with line breaks kept. Without quotes the parser guesses types: `3.10` becomes the number 3.1; in older YAML rules `on` and `yes` become true.

## Walkthrough of this repository's use

### Block text: why `run: |`

```yaml
    steps:
      - env:
          TITLE: ${{ github.event.issue.title }}
        run: |
          echo "New issue: $TITLE"
```

`|` starts a **block scalar**: everything on the following, more-indented lines is the value, with line breaks kept. Inside a block nothing needs quoting. The lab file shows the alternative that fails:

```yaml
run: echo "New issue: ${{ github.event.issue.title }}"
```

In a plain one-line value, a colon followed by a space (`: `) begins a nested mapping, so YAML reads `echo "New issue` as a key. The parser stops with an error such as `Nested mappings are not allowed in compact mappings`. The comment at the top of `exploit/vulnerable/.github/workflows/greet.yml` records that the repository uses the block form for this reason.

### Lists, mappings and the short forms

```yaml
on:
  issues:
    types: [opened]
```

`on:` is a **mapping** (keys with values). `types: [opened]` is a **flow sequence**, a list written on one line. The same list could be written

```yaml
    types:
      - opened
```

`permissions: {}` is an empty mapping written in **flow style**: "no entries". That is different from leaving `permissions` out. Missing means "use the repository default"; empty means "grant nothing".

```yaml
workflows: [pr-build]
branches: [main]
```

(inside `pr-report.yml` and `ci.yml`.) Lists of names are written inline.

### Quoting

```yaml
node-version: "22"
patterns: ["*"]
```

Without quotes, `22` would be a number, not the text `22`, and for versions like `3.10` the zeros would be lost. `"*"` is quoted because a bare `*` means "alias" in YAML (a reference to a named block elsewhere in the file) and would be a syntax error.

### Comments

```yaml
    permissions:
      id-token: write # lets the job request an OIDC token
      contents: read
```

`#` starts a comment, but only when a space comes before it. The same mechanism carries the pinned version after each SHA: `uses: actions/checkout@3d3c42e5...90b1 # v7.0.1`. Dependabot reads that comment.

### Expressions are not YAML

`${{ ... }}` is GitHub's own syntax inside text. YAML sees it as characters of a string. A value starting with `$` is fine; one starting with `{` or `*` or `&` would need quotes. `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}` is a plain string that GitHub later turns into `true` or `false`.

### Indentation

Two spaces per level; tabs are not allowed. A key moved by one space moves to a different parent. That is why `.editorconfig` and Prettier both fix the indentation at two spaces.

## Try it yourself

1. `node -e "console.log(require('yaml').parse('a: 22\nb: \"22\"'))"` prints `{ a: 22, b: '22' }`: unquoted is a number, quoted is text.
2. `node -e "try{require('yaml').parse('run: echo \"New issue: x\"')}catch(e){console.log(e.message.split('\n')[0])}"` prints `Nested mappings are not allowed in compact mappings at line 1, column 6:`.
3. `node -e "console.log(require('yaml').parse('permissions: {}'))"` prints `{ permissions: {} }`.
4. `actionlint` prints nothing for the repository's workflows; add a tab at the start of a line in a copy of one and it reports a syntax error.
5. `grep -n "run: |" .github/workflows/*.yml` lists the multi-line scripts.

## Mistakes people make

- Unquoted version numbers.
- Tabs for indentation.
- A colon and a space inside an unquoted value (the lab's bug).
- Confusing a missing key with an empty one (`permissions` absent versus `permissions: {}`).
- Treating `${{ }}` as if YAML understood it.
- Changing indentation by one space and moving a key under a different parent.

## Check yourself

1. Why `node-version: "22"` in quotes? *(Unquoted it is a number; for versions like `3.10` the trailing zero would be lost.)*
2. What does `run: |` do? *(Starts a block of text that keeps its lines and needs no quoting.)*
3. Why is the lesson's one-line `echo "New issue: ..."` invalid? *(A colon followed by a space inside a plain value starts a nested mapping.)*
4. What is the difference between no `permissions` and `permissions: {}`? *(Default scopes versus no scopes.)*
5. Is `${{ ... }}` YAML? *(No, it is GitHub's expression syntax inside text.)*

## Further reading

- YAML 1.2.2: https://yaml.org/spec/1.2.2/
- The `yaml` package used by the linter: https://eemeli.org/yaml/
