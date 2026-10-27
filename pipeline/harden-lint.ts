import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LineCounter, parseDocument, type Document, type Node } from "yaml";

export type Severity = "error" | "warning";

export interface Finding {
  readonly rule: RuleId;
  readonly severity: Severity;
  readonly file: string;
  readonly line: number;
  readonly job: string | undefined;
  readonly message: string;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Mapping = { [key: string]: Json };
type Path = (string | number)[];

/** Every rule this linter has, with the attack in the lesson's lab that it would have caught. */
export const RULES = {
  "script-injection": "an event field reaches a shell script through an expression (lab attack 1: greet.yml)",
  "privileged-checkout": "a privileged trigger checks out the pull request's own code (lab attack 2: pr-build.yml)",
  "missing-permissions": "no permissions block, so the token takes the repository default (lab attack 3: label.yml)",
  "broad-permissions": "write-all, or write permissions granted to every job of the workflow",
  "unpinned-action": "an action is referenced by a tag or branch, which its owner can move",
  "persist-credentials": "checkout leaves the token in the git config for later steps",
  "stored-cloud-key": "a long-lived cloud credential is read from a secret instead of OIDC",
  "oidc-without-environment": "a job can request an OIDC token but is not tied to an environment",
} as const;
export type RuleId = keyof typeof RULES;

const EXPRESSION = /\$\{\{([\s\S]*?)\}\}/g;
/** Event fields that are numbers or ids GitHub generates, not text a stranger typed. */
const SAFE_EVENT_FIELD =
  /^github\.event\.(number|pull_request\.number|issue\.number|workflow_run\.id|workflow_run\.run_id)$/;
const EVENT_REFERENCE = /github\.event\.[A-Za-z0-9_.*'-]+|github\.head_ref|github\.ref_name/g;
const PR_HEAD = /github\.event\.pull_request\.head|github\.head_ref|github\.event\.workflow_run\.head|refs\/pull\//;
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const CLOUD_KEY =
  /secrets\.(AWS_[A-Z0-9_]*(KEY|TOKEN)[A-Z0-9_]*|[A-Z0-9_]*(CREDENTIALS|SA_KEY|SERVICE_ACCOUNT_KEY)[A-Z0-9_]*|AZURE_CLIENT_SECRET|DEPLOY_TOKEN)\b/;
const PRIVILEGED_TRIGGERS = ["pull_request_target", "workflow_run"];

function asMapping(value: Json | undefined): Mapping {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asList(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

/** The event names a workflow listens to, whether `on` is a string, a list or a map. */
export function triggersOf(on: Json | undefined): string[] {
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.filter((item): item is string => typeof item === "string");
  return Object.keys(asMapping(on));
}

/** The untrusted-looking references inside every expression of `text`. */
export function untrustedReferences(text: string): string[] {
  const found: string[] = [];
  for (const expression of text.matchAll(EXPRESSION)) {
    for (const reference of (expression[1] ?? "").matchAll(EVENT_REFERENCE)) {
      if (!SAFE_EVENT_FIELD.test(reference[0])) found.push(reference[0]);
    }
  }
  return found;
}

/** Lint one workflow file's text; `file` only labels the findings. */
export function lintWorkflow(file: string, text: string): Finding[] {
  const lineCounter = new LineCounter();
  const document: Document = parseDocument(text, { lineCounter });
  // YAML 1.1 reads the key `on` as the boolean true; the yaml package keeps it as the string "on".
  const workflow = asMapping(document.toJS() as Json);
  const findings: Finding[] = [];

  const lineOf = (path: Path): number => {
    const node = document.getIn(path, true) as Node | null | undefined;
    return lineCounter.linePos(node?.range?.[0] ?? 0).line;
  };
  const report = (rule: RuleId, severity: Severity, path: Path, job: string | undefined, message: string): void => {
    findings.push({ rule, severity, file, line: lineOf(path), job, message });
  };

  const triggers = triggersOf(workflow["on"]);
  const privilegedTriggers = triggers.filter((trigger) => PRIVILEGED_TRIGGERS.includes(trigger));
  const topPermissions = workflow["permissions"];

  if (topPermissions === "write-all") {
    report(
      "broad-permissions",
      "error",
      ["permissions"],
      undefined,
      "permissions: write-all gives the token every scope",
    );
  } else if (Object.values(asMapping(topPermissions)).includes("write")) {
    report(
      "broad-permissions",
      "warning",
      ["permissions"],
      undefined,
      "write permissions at the workflow level reach every job; grant them per job",
    );
  }

  for (const [jobId, rawJob] of Object.entries(asMapping(workflow["jobs"]))) {
    const job = asMapping(rawJob);
    const jobPermissions = job["permissions"];

    if (topPermissions === undefined && jobPermissions === undefined) {
      report(
        "missing-permissions",
        "error",
        ["jobs", jobId],
        jobId,
        "no permissions at the workflow or the job: the token takes the repository default, which may be read and write",
      );
    }
    if (jobPermissions === "write-all") {
      report(
        "broad-permissions",
        "error",
        ["jobs", jobId, "permissions"],
        jobId,
        "permissions: write-all gives the token every scope",
      );
    }
    if (asMapping(jobPermissions)["id-token"] === "write" && job["environment"] === undefined) {
      report(
        "oidc-without-environment",
        "warning",
        ["jobs", jobId],
        jobId,
        "id-token: write without an environment: the trust policy cannot require an approval",
      );
    }

    const jobKey = CLOUD_KEY.exec(JSON.stringify(job["env"] ?? {}));
    if (jobKey) {
      report(
        "stored-cloud-key",
        "error",
        ["jobs", jobId, "env"],
        jobId,
        `${jobKey[0]} is a long-lived credential; use OIDC to get temporary ones`,
      );
    }

    const reusable = job["uses"];
    const steps: Json[] = typeof reusable === "string" ? [{ uses: reusable }] : asList(job["steps"]);
    steps.forEach((rawStep, index) => {
      const step = asMapping(rawStep);
      const stepPath: Path = typeof reusable === "string" ? ["jobs", jobId] : ["jobs", jobId, "steps", index];
      const uses = step["uses"];
      const withInputs = asMapping(step["with"]);

      if (typeof uses === "string" && !uses.startsWith("./") && !uses.startsWith("docker://") && !PINNED.test(uses)) {
        report("unpinned-action", "error", [...stepPath, "uses"], jobId, `${uses} is not pinned to a full commit SHA`);
      }

      const scripts: [string | Json | undefined, Path][] = [
        [step["run"], [...stepPath, "run"]],
        [withInputs["script"], [...stepPath, "with", "script"]],
      ];
      for (const [code, path] of scripts) {
        if (typeof code !== "string") continue;
        const references = untrustedReferences(code);
        if (references.length > 0) {
          report(
            "script-injection",
            "error",
            path,
            jobId,
            `${[...new Set(references)].join(", ")} is expanded into the script before the shell runs it; pass it through env and read it as a shell variable`,
          );
        }
      }

      if (typeof uses === "string" && uses.startsWith("actions/checkout")) {
        const aimedAtPullRequest = ["ref", "repository"].some((key) => PR_HEAD.test(String(withInputs[key] ?? "")));
        if (privilegedTriggers.length > 0 && aimedAtPullRequest) {
          report(
            "privileged-checkout",
            "error",
            [...stepPath, "with"],
            jobId,
            `${privilegedTriggers.join(" / ")} checks out the pull request's own code, which then runs with this repository's privileges`,
          );
        }
        if (withInputs["persist-credentials"] !== false) {
          report(
            "persist-credentials",
            privilegedTriggers.length > 0 ? "error" : "warning",
            [...stepPath, step["with"] === undefined ? "uses" : "with"],
            jobId,
            "checkout keeps the token in .git/config; set persist-credentials: false",
          );
        }
      }

      const key = CLOUD_KEY.exec(JSON.stringify(step));
      if (key) {
        report(
          "stored-cloud-key",
          "error",
          stepPath,
          jobId,
          `${key[0]} is a long-lived credential; use OIDC to get temporary ones`,
        );
      }
    });
  }
  return findings;
}

function workflowFiles(path: string): string[] {
  if (statSync(path).isDirectory()) {
    return readdirSync(path)
      .filter((name) => /\.ya?ml$/.test(name))
      .sort()
      .map((name) => join(path, name));
  }
  return [path];
}

/** Lint every workflow file under the given files and folders. */
export function lintPaths(paths: readonly string[]): Finding[] {
  return paths.flatMap(workflowFiles).flatMap((file) => lintWorkflow(file, readFileSync(file, "utf8")));
}

/** `file:line: severity [rule] message (job)` */
export function formatFinding(finding: Finding): string {
  const job = finding.job ? ` (job ${finding.job})` : "";
  return `${finding.file}:${finding.line}: ${finding.severity} [${finding.rule}] ${finding.message}${job}`;
}
