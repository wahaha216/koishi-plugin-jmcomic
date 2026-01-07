export class AllDomainFailedError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AllDomainFailedError";
  }
}
