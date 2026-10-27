import js from "@eslint/js";
import tseslint from "typescript-eslint";

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
