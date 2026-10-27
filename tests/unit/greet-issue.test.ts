import { describe, expect, it } from "vitest";
import { GreetIssue, type Notifier } from "../../src/application/greet-issue.js";
import { GreetingError } from "../../src/domain/errors.js";

class RecordingNotifier implements Notifier {
  readonly lines: string[] = [];
  notify(line: string): void {
    this.lines.push(line);
  }
}

describe("GreetIssue", () => {
  it("sends one line to the notifier", () => {
    const notifier = new RecordingNotifier();
    new GreetIssue(notifier).run("octocat", "Hello");
    expect(notifier.lines).toEqual(["New issue from octocat: Hello"]);
  });

  it("sends nothing when the issue is unusable", () => {
    const notifier = new RecordingNotifier();
    expect(() => new GreetIssue(notifier).run("not a login", "Hello")).toThrow(GreetingError);
    expect(notifier.lines).toEqual([]);
  });
});
