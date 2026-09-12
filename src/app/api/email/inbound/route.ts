import { errorResponse } from "@/auth/http";
import { handleResendWebhook } from "@/delivery/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
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
