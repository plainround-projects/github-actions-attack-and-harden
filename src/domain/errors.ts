/** The title or author cannot be turned into a greeting. */
export class GreetingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GreetingError";
  }
}
