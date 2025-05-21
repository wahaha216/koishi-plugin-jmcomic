export class AlbumNotExistError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AlbumNotExistError";
  }
}
