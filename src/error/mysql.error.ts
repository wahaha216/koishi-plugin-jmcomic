export class MySqlError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "MySqlError";
  }
}
