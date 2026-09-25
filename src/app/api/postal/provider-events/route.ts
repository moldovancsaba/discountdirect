import { errorResponse } from "@/auth/http";
import {
  handlePostalProviderEvent,
  PostalProviderError,
} from "@/postal/provider";
import { redisRateLimit } from "@/lib/redis";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const address = (
    request.headers.get("x-forwarded-for")?.split(",", 1)[0] ?? "unknown"
  )
    .trim()
    .slice(0, 64);
  const rate = await redisRateLimit("postal-webhook", address, 120).catch(
    () => ({
      enabled: false as const,
      accepted: true,
      reasonCode: "REDIS_UNAVAILABLE" as const,
    }),
  );
  if (rate.enabled && !rate.accepted)
    return errorResponse(
      "RATE_LIMITED",
      "A postai események fogadási korlátját elérted.",
      429,
    );
  try {
    const payload = await request.text();
    if (!payload || payload.length > 64_000)
      return errorResponse(
        "INVALID_POSTAL_EVENT",
        "Érvénytelen postai esemény.",
        400,
      );
    return Response.json(
      await handlePostalProviderEvent(payload, request.headers),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof PostalProviderError && error.code === "UNAVAILABLE"
        ? 503
        : 400;
    return errorResponse(
      "POSTAL_EVENT_REJECTED",
      "A postai esemény nem dolgozható fel.",
      status,
    );
  }
}
