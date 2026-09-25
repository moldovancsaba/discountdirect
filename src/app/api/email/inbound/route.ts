import { errorResponse } from "@/auth/http";
import { handleResendWebhook } from "@/delivery/service";
import { redisRateLimit } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const address = (request.headers.get("x-forwarded-for")?.split(",", 1)[0] ?? "unknown").trim().slice(0, 64);
    const rate = await redisRateLimit("resend-webhook", address, 120).catch(() => ({ enabled: false as const, accepted: true, reasonCode: "REDIS_UNAVAILABLE" as const }));
    if (rate.enabled && !rate.accepted) return errorResponse("RATE_LIMITED", "A kézbesítési események fogadási korlátját elérted.", 429);
    const payload = await request.text();
    if (!payload || payload.length > 128_000) return errorResponse("INVALID_WEBHOOK", "Érvénytelen kézbesítési esemény.", 400);
    const result = await handleResendWebhook(payload, request.headers);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/SIGNATURE|PAYLOAD|JSON/.test(message)) return errorResponse("INVALID_WEBHOOK", "Érvénytelen kézbesítési esemény.", 400);
    return errorResponse("DELIVERY_WEBHOOK_UNAVAILABLE", "A kézbesítési esemény átmenetileg nem dolgozható fel.", 503);
  }
}
