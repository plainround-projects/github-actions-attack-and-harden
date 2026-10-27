import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RULES, lintPaths, type Finding } from "../../pipeline/harden-lint.js";

const root = resolve(import.meta.dirname, "../..");
const checklist = readFileSync(resolve(root, "docs/review-checklist.md"), "utf8");
const findings = lintPaths([resolve(root, "exploit/vulnerable/.github/workflows")]);

/** Every `path:line` the checklist names for a lab file. */
const labReferences = [...checklist.matchAll(/`(exploit\/vulnerable\/[\w./-]+\.yml):(\d+)`/g)].map((match) => ({
  file: match[1] ?? "",
  line: Number(match[2]),
}));

describe("docs/review-checklist.md", () => {
  it("names at least one line of the lab for each of the three attacks", () => {
    const files = new Set(labReferences.map((reference) => reference.file.split("/").pop()));
    expect(files).toEqual(new Set(["greet.yml", "pr-build.yml", "label.yml"]));
  });

  it.each(labReferences)("$file:$line is a line the linter reports", ({ file, line }) => {
    const atLine = findings.filter(
      (finding: Finding) => finding.file.endsWith(file.replace("exploit/vulnerable/", "")) && finding.line === line,
    );
    expect(atLine.length).toBeGreaterThan(0);
  });

  it("mentions only rules that exist", () => {
    const mentioned = [...checklist.matchAll(/`([a-z]+(?:-[a-z]+)+)`/g)]
      .map((match) => match[1] ?? "")
      .filter((name) => name in RULES);
    expect(new Set(mentioned).size).toBe(Object.keys(RULES).length);
  });

  it("includes pinning actions to commit SHAs", () => {
    expect(checklist).toMatch(/pinned to a full commit SHA/);
  });
});
