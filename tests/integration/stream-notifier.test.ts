import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { GreetIssue } from "../../src/application/greet-issue.js";
import { StreamNotifier } from "../../src/infrastructure/stream-notifier.js";

describe("StreamNotifier on a real stream", () => {
  it("writes each notification as one line", () => {
    const stream = new PassThrough();
    const notifier = new StreamNotifier(stream);
    notifier.notify("one");
    notifier.notify("two");
    stream.end();
    expect(stream.read().toString()).toBe("one\ntwo\n");
  });

  it("carries a greeting through the use case to the stream", () => {
    const stream = new PassThrough();
    new GreetIssue(new StreamNotifier(stream)).run("octocat", "Hello");
    stream.end();
    expect(stream.read().toString()).toBe("New issue from octocat: Hello\n");
  });
});
