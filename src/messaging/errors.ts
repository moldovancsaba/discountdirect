export class MessagingError extends Error {
  code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT";

  constructor(code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT") {
    super(code);
    this.code = code;
  }
}
