export class MessagingError extends Error {
  code: "FORBIDDEN" | "NOT_FOUND" | "INVALID";

  constructor(code: "FORBIDDEN" | "NOT_FOUND" | "INVALID") {
    super(code);
    this.code = code;
  }
}
