import { errorResponse, requestId } from "@/auth/http";
import { processDueDeliveries } from "@/delivery/service";
import { matchesToken } from "@/lib/operator-session";
import { processPostalSubmissions } from "@/postal/provider";
import { withRedisLock } from "@/lib/redis-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matchesToken(token, process.env.CRON_SECRET))
    return errorResponse("UNAUTHORIZED", "Cron hozzáférés szükséges.", 401);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const bounded = Number.isFinite(limit) ? limit : 20;
  try {
    const result = await withRedisLock("cron", "deliveries", async () => {
      const [deliveries, postal] = await Promise.all([
        processDueDeliveries(bounded),
        processPostalSubmissions(Math.min(10, bounded)),
      ]);
      return { deliveries, postal };
    });
    if (result.locked)
      return Response.json(
        {
          deliveries: { processed: 0 },
          postal: { processed: 0 },
          skipped: true,
          reasonCode: "REDIS_LOCK_BUSY",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(result.result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const id = requestId();
    console.error("cron_deliveries_failed", {
      requestId: id,
      code:
        error instanceof Error && "code" in error
          ? String((error as { code?: unknown }).code)
          : "UNKNOWN",
    });
    return errorResponse(
      "CRON_RUN_FAILED",
      "A kézbesítések futtatása átmenetileg nem sikerült.",
      503,
      id,
    );
  }
}
