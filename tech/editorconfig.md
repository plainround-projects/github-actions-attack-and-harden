# EditorConfig

## What it is

EditorConfig is a tiny settings file, `.editorconfig`, that most code editors read to apply the same basic text rules (indent size, line endings) to everyone who edits a project. It is a file format with sections named by file patterns.

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **repository**: A project's folder of files together with its complete history of changes. On GitHub, a repository is a page with those files, issues and pull requests.
- **YAML**: A plain-text format for structured data that uses indentation instead of braces. GitHub workflows are YAML files.
- **folder**: A container for files and other folders on disk (also called a directory).
- **UTF-8**: The usual way of storing text as bytes, able to represent every written language.
- **Terraform**: A tool that creates cloud resources from files that describe them.

</details>

<!-- /words -->

## Why this repository uses it

Every file type here wants two-space indentation, except the Makefile, which requires a tab. `.editorconfig` tells editors so before anyone types a character. Prettier enforces the same width for the files it formats; EditorConfig covers files Prettier does not, such as the Makefile and Terraform.

## Where it appears

| Path | What it is |
| --- | --- |
| `.editorconfig` | The settings for all files and one override for `Makefile`. |
| `.prettierrc.json` | `tabWidth: 2`, matching `indent_size = 2`. |

## How it works underneath

An editor looks for `.editorconfig` in the file's folder and each parent, stops at the first one with `root = true`, and applies every section whose pattern matches the file's name. Later sections override earlier ones.

## Walkthrough of this repository's use

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[Makefile]
indent_style = tab
```

- `root = true`: stop looking for more `.editorconfig` files in parent folders.
- `[*]`: the section for every file.
- `charset = utf-8`: save as UTF-8.
- `end_of_line = lf`: Unix line endings (not the Windows `CRLF`).
- `insert_final_newline = true`: every file ends with one line break.
- `trim_trailing_whitespace = true`: remove spaces at the ends of lines.
- `indent_style = space`, `indent_size = 2`: two spaces, never tabs.
- `[Makefile]`: the one exception. Make recipe lines must start with a tab.

(Terraform's own `terraform fmt` also uses two spaces.)

## Try it yourself

1. `cat .editorconfig` shows the file.
2. `grep -nP '\t' .github/workflows/*.yml | head -1` prints nothing: no tabs in workflows.
3. `grep -nP '^\t' Makefile | head -2` shows recipe lines that start with a tab.
4. `file .editorconfig Makefile` reports text files without `CRLF`.
5. In an editor with EditorConfig support, open a YAML file and press Tab: it inserts two spaces.

## Mistakes people make

- Assuming formatters read it; Prettier has its own settings (this repository keeps them consistent by hand).
- Mixed tabs and spaces in a Makefile.
- Forgetting `root = true` and inheriting rules from a parent folder.
- Expecting the editor to apply it without the plugin or built-in support.

## Check yourself

1. Who reads `.editorconfig`? *(The editor, through a built-in feature or a plugin.)*
2. Why a separate rule for `Makefile`? *(Make requires a tab.)*
3. What does `root = true` do? *(Stops the upward search for more `.editorconfig` files.)*
4. What indent do YAML files get? *(Two spaces.)*
5. What does `end_of_line = lf` mean? *(Unix line endings.)*

## Further reading

- EditorConfig specification: https://spec.editorconfig.org/
