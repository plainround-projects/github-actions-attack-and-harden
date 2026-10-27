import type { Notifier } from "../application/greet-issue.js";

/** A Notifier that writes each line to a stream such as process.stdout. */
export class StreamNotifier implements Notifier {
  constructor(private readonly stream: { write(chunk: string): unknown }) {}

  notify(line: string): void {
    this.stream.write(`${line}\n`);
  }
}
