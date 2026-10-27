import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RULES,
  formatFinding,
  lintPaths,
  lintWorkflow,
  triggersOf,
  untrustedReferences,
} from "../../pipeline/harden-lint.js";

const root = resolve(import.meta.dirname, "../..");
const SHA = "a".repeat(40);

const rulesOf = (text: string) => lintWorkflow("w.yml", text).map((finding) => finding.rule);

describe("untrustedReferences", () => {
  it("finds event fields a stranger can type", () => {
    expect(untrustedReferences("echo ${{ github.event.issue.title }} ${{ github.head_ref }}")).toEqual([
      "github.event.issue.title",
      "github.head_ref",
    ]);
  });

  it("ignores numbers and ids GitHub generates", () => {
    expect(untrustedReferences("${{ github.event.pull_request.number }} ${{ github.event.workflow_run.id }}")).toEqual(
      [],
    );
  });

  it("ignores text outside expressions", () => {
    expect(untrustedReferences("echo github.event.issue.title")).toEqual([]);
  });
});

describe("triggersOf", () => {
  it("reads a string, a list and a map", () => {
    expect(triggersOf("push")).toEqual(["push"]);
    expect(triggersOf(["push", "pull_request"])).toEqual(["push", "pull_request"]);
    expect(triggersOf({ issues: { types: ["opened"] } })).toEqual(["issues"]);
    expect(triggersOf(undefined)).toEqual([]);
  });
});

describe("rules, one at a time", () => {
  it("script-injection: an event field in a run step", () => {
    const text = `on: issues\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo "\${{ github.event.issue.title }}"\n`;
    expect(rulesOf(text)).toEqual(["script-injection"]);
  });

  it("script-injection: an event field in a github-script body", () => {
    const text = `on: issues\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/github-script@${SHA}\n        with:\n          script: console.log("\${{ github.event.issue.body }}")\n`;
    expect(rulesOf(text)).toEqual(["script-injection"]);
  });

  it("the same field through env is clean", () => {
    const text = `on: issues\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - env:\n          TITLE: \${{ github.event.issue.title }}\n        run: echo "$TITLE"\n`;
    expect(rulesOf(text)).toEqual([]);
  });

  it("privileged-checkout: pull_request_target checking out the head", () => {
    const text = `on: pull_request_target\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@${SHA}\n        with:\n          ref: \${{ github.event.pull_request.head.sha }}\n          persist-credentials: false\n`;
    expect(rulesOf(text)).toEqual(["privileged-checkout"]);
  });

  it("privileged-checkout: workflow_run checking out the triggering head branch", () => {
    const text = `on:\n  workflow_run:\n    workflows: [x]\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@${SHA}\n        with:\n          ref: \${{ github.event.workflow_run.head_sha }}\n          persist-credentials: false\n`;
    expect(rulesOf(text)).toContain("privileged-checkout");
  });

  it("a plain checkout under pull_request_target is not privileged-checkout", () => {
    const text = `on: pull_request_target\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@${SHA}\n        with:\n          persist-credentials: false\n`;
    expect(rulesOf(text)).toEqual([]);
  });

  it("missing-permissions: neither the workflow nor the job says", () => {
    expect(rulesOf(`on: push\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo hi\n`)).toEqual([
      "missing-permissions",
    ]);
  });

  it("a job-level permissions block satisfies missing-permissions", () => {
    expect(
      rulesOf(
        `on: push\njobs:\n  j:\n    runs-on: x\n    permissions:\n      contents: read\n    steps:\n      - run: echo hi\n`,
      ),
    ).toEqual([]);
  });

  it("broad-permissions: write-all is an error, workflow-level write is a warning", () => {
    const all = lintWorkflow(
      "w.yml",
      `on: push\npermissions: write-all\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo hi\n`,
    );
    expect(all.map((f) => [f.rule, f.severity])).toEqual([["broad-permissions", "error"]]);
    const top = lintWorkflow(
      "w.yml",
      `on: push\npermissions:\n  contents: write\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo hi\n`,
    );
    expect(top.map((f) => [f.rule, f.severity])).toEqual([["broad-permissions", "warning"]]);
  });

  it("broad-permissions: write-all on a job", () => {
    expect(
      rulesOf(
        `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    permissions: write-all\n    steps:\n      - run: echo hi\n`,
      ),
    ).toEqual(["broad-permissions"]);
  });

  it("unpinned-action: a tag, and a reusable workflow called by tag", () => {
    expect(
      rulesOf(
        `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/setup-node@v4\n`,
      ),
    ).toEqual(["unpinned-action"]);
    expect(rulesOf(`on: push\npermissions: {}\njobs:\n  j:\n    uses: o/r/.github/workflows/x.yml@v1\n`)).toEqual([
      "unpinned-action",
    ]);
  });

  it("unpinned-action: a SHA, a local path and a digest are fine", () => {
    const text = `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/setup-node@${SHA}\n      - uses: ./local\n      - uses: docker://alpine@sha256:${"b".repeat(64)}\n`;
    expect(rulesOf(text)).toEqual([]);
  });

  it("persist-credentials: a checkout that keeps the token", () => {
    const text = `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@${SHA}\n`;
    expect(lintWorkflow("w.yml", text).map((f) => [f.rule, f.severity])).toEqual([["persist-credentials", "warning"]]);
  });

  it("stored-cloud-key: a long-lived credential from a secret", () => {
    const text = `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    env:\n      AWS_ACCESS_KEY_ID: \${{ secrets.AWS_ACCESS_KEY_ID }}\n    steps:\n      - run: echo hi\n`;
    expect(rulesOf(text)).toEqual(["stored-cloud-key"]);
    const inStep = `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo hi\n        env:\n          KEY: \${{ secrets.DEPLOY_TOKEN }}\n`;
    expect(rulesOf(inStep)).toEqual(["stored-cloud-key"]);
  });

  it("oidc-without-environment: id-token write on a job with no environment", () => {
    const text = `on: push\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    permissions:\n      id-token: write\n    steps:\n      - run: echo hi\n`;
    expect(lintWorkflow("w.yml", text).map((f) => [f.rule, f.severity])).toEqual([
      ["oidc-without-environment", "warning"],
    ]);
  });
});

describe("findings", () => {
  it("carry the line of the offending key and format as file:line", () => {
    const text = `on: issues\npermissions: {}\njobs:\n  j:\n    runs-on: x\n    steps:\n      - run: echo "\${{ github.event.issue.title }}"\n`;
    const findings = lintWorkflow("w.yml", text);
    expect(findings[0]?.line).toBe(7);
    expect(findings.map(formatFinding)[0]).toMatch(/^w\.yml:7: error \[script-injection\] .*\(job j\)$/);
  });

  it("every rule has a description", () => {
    for (const description of Object.values(RULES)) expect(description.length).toBeGreaterThan(20);
  });
});

describe("the lab and the repository", () => {
  const vulnerable = join(root, "exploit/vulnerable/.github/workflows");

  it("finds the injection in the lab's greet.yml", () => {
    const rules = lintPaths([join(vulnerable, "greet.yml")]).map((f) => f.rule);
    expect(rules).toContain("script-injection");
    expect(rules).toContain("missing-permissions");
  });

  it("finds the privileged checkout, the secret and the unpinned action in the lab's pr-build.yml", () => {
    const rules = lintPaths([join(vulnerable, "pr-build.yml")]).map((f) => f.rule);
    expect(rules).toEqual(
      expect.arrayContaining(["privileged-checkout", "stored-cloud-key", "missing-permissions", "unpinned-action"]),
    );
  });

  it("finds the missing permissions in the lab's label.yml", () => {
    expect(lintPaths([join(vulnerable, "label.yml")]).map((f) => f.rule)).toEqual(["missing-permissions"]);
  });

  it("finds nothing at all in the repository's own workflows", () => {
    expect(lintPaths([join(root, ".github/workflows")]).map(formatFinding)).toEqual([]);
  });

  it("reads every workflow file of a folder and ignores other files", () => {
    const names = readdirSync(join(root, ".github/workflows")).filter((n) => n.endsWith(".yml"));
    expect(names.length).toBeGreaterThanOrEqual(6);
    expect(readFileSync(join(vulnerable, "label.yml"), "utf8")).toContain("DELIBERATELY VULNERABLE");
  });
});
