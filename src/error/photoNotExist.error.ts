export class PhotoNotExistError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "PhotoNotExistError";
  }
}
