export class DomainError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400) { super(message); }
}
