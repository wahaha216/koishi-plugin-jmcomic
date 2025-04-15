export class EmptyBufferError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "EmptyBufferError";
  }
}
