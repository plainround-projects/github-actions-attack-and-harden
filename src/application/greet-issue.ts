import { createGreeting, renderGreeting } from "../domain/greeting.js";

/** Where a greeting is written. */
export interface Notifier {
  notify(line: string): void;
}

/** Use case: greet the author of a new issue. */
export class GreetIssue {
  constructor(private readonly notifier: Notifier) {}

  /** Print the greeting for `author` and `rawTitle`; throws GreetingError when either is unusable. */
  run(author: string, rawTitle: string): void {
    this.notifier.notify(renderGreeting(createGreeting(author, rawTitle)));
  }
}
