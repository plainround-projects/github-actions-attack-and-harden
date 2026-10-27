import { GreetIssue } from "../application/greet-issue.js";
import { GreetingError } from "../domain/errors.js";
import { StreamNotifier } from "../infrastructure/stream-notifier.js";

export interface CliIo {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

/**
 * Print the greeting for the issue described by ISSUE_AUTHOR and ISSUE_TITLE.
 * Exit code 0 on success, 1 for an unusable issue, 2 when a variable is missing.
 */
export function main(io: CliIo): number {
  const { ISSUE_AUTHOR: author, ISSUE_TITLE: title } = io.env;
  if (author === undefined || title === undefined) {
    io.stderr.write("greeter: set ISSUE_AUTHOR and ISSUE_TITLE\n");
    return 2;
  }
  try {
    new GreetIssue(new StreamNotifier(io.stdout)).run(author, title);
    return 0;
  } catch (error) {
    if (error instanceof GreetingError) {
      io.stderr.write(`greeter: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
