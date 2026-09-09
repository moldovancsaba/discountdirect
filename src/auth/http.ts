export function requestId() {
  return crypto.randomUUID();
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  id = requestId(),
) {
  return Response.json(
    { error: { code, message, requestId: id } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  return origin === `${new URL(request.url).protocol}//${host}`;
}

export function hasAcceptableJsonBody(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  return (
    contentType === "application/json" &&
    Number.isFinite(contentLength) &&
    contentLength <= 4096
  );
}

export function clientAddress(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown")
    .trim()
    .slice(0, 64);
}
