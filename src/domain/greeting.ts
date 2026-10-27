import { GreetingError } from "./errors.js";

export const MAX_TITLE_LENGTH = 80;

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

/** What the greeter says about one new issue. Immutable. */
export interface Greeting {
  readonly author: string;
  readonly title: string;
}

/**
 * Turn text a stranger typed into one printable line: control characters and line breaks become spaces, runs of
 * whitespace collapse, and anything past MAX_TITLE_LENGTH is cut with an ellipsis. The result is data to print, never
 * something to run; the workflow still passes it through an environment variable.
 */
export function sanitizeTitle(raw: string): string {
  const printable = raw.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
  return printable.length > MAX_TITLE_LENGTH ? `${printable.slice(0, MAX_TITLE_LENGTH - 1)}…` : printable;
}

/** Build a greeting, rejecting an empty title or an author name that is not a GitHub login. */
export function createGreeting(author: string, rawTitle: string): Greeting {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(author)) {
    throw new GreetingError(`not a valid author login: ${JSON.stringify(author.slice(0, 40))}`);
  }
  const title = sanitizeTitle(rawTitle);
  if (title === "") {
    throw new GreetingError("the issue title is empty");
  }
  return { author, title };
}

/** The line printed for a greeting. */
export function renderGreeting(greeting: Greeting): string {
  return `New issue from ${greeting.author}: ${greeting.title}`;
}
