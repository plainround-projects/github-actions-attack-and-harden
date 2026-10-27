import { RULES, formatFinding, lintPaths } from "./harden-lint.js";

const args = process.argv.slice(2);
const paths = args.filter((arg) => !arg.startsWith("--"));

if (args.includes("--rules")) {
  for (const [id, description] of Object.entries(RULES)) console.log(`${id}\t${description}`);
  process.exit(0);
}

const findings = lintPaths(paths.length > 0 ? paths : [".github/workflows"]);
for (const finding of findings) console.log(formatFinding(finding));
const errors = findings.filter((finding) => finding.severity === "error").length;
console.log(`harden-lint: ${errors} error(s), ${findings.length - errors} warning(s)`);
process.exit(findings.length > 0 ? 1 : 0);
