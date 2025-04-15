export class OverRetryError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "OverRetryError";
  }
}
