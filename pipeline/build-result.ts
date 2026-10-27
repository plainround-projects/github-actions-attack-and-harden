/**
 * The result file pr-build.yml writes and pr-report.yml reads.
 *
 * It travels as an artifact produced by a workflow that ran a stranger's code, so everything in it is untrusted:
 * only an integer pull request number, a 40-character commit hash and one of three words are accepted. Anything else
 * is rejected before it can reach a URL, a comment or a log.
 */

export const CONCLUSIONS = ["success", "failure", "cancelled"] as const;
export type Conclusion = (typeof CONCLUSIONS)[number];

export interface BuildResult {
  readonly pr: number;
  readonly sha: string;
  readonly conclusion: Conclusion;
}

/** The result file is malformed or contains a value outside what is accepted. */
export class InvalidResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResultError";
  }
}

const MAX_PR_NUMBER = 10_000_000;

/** Parse and validate the text of a result file. */
export function parseResult(text: string): BuildResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new InvalidResultError("the result is not JSON");
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new InvalidResultError("the result is not an object");
  }
  const record = data as Record<string, unknown>;
  const unexpected = Object.keys(record).filter((key) => !["pr", "sha", "conclusion"].includes(key));
  if (unexpected.length > 0) {
    throw new InvalidResultError(
      `unexpected field(s): ${unexpected.map((key) => JSON.stringify(key.slice(0, 20))).join(", ")}`,
    );
  }
  const { pr, sha, conclusion } = record;
  if (typeof pr !== "number" || !Number.isInteger(pr) || pr < 1 || pr > MAX_PR_NUMBER) {
    throw new InvalidResultError("pr must be a positive integer");
  }
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new InvalidResultError("sha must be 40 lowercase hexadecimal characters");
  }
  if (typeof conclusion !== "string" || !(CONCLUSIONS as readonly string[]).includes(conclusion)) {
    throw new InvalidResultError(`conclusion must be one of ${CONCLUSIONS.join(", ")}`);
  }
  return { pr, sha, conclusion: conclusion as Conclusion };
}

/** Marks the comment this tool owns, so a re-run updates it instead of adding another. */
export const COMMENT_MARKER = "<!-- pr-report -->";

/** The Markdown body of the comment for a result. */
export function renderComment(result: BuildResult): string {
  const verdict = { success: "passed", failure: "failed", cancelled: "was cancelled" }[result.conclusion];
  return `${COMMENT_MARKER}\nThe build of \`${result.sha.slice(0, 7)}\` ${verdict}.`;
}
