import { errorResponse, requestId } from "@/auth/http";
import { matchesToken } from "@/lib/operator-session";
import { runDueAutomations } from "@/automations/service";
import { withRedisLock } from "@/lib/redis-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matchesToken(token, process.env.CRON_SECRET))
    return errorResponse("UNAUTHORIZED", "Cron hozzáférés szükséges.", 401);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  try {
    const result = await withRedisLock("cron", "automations", () =>
      runDueAutomations(Number.isFinite(limit) ? limit : 20),
    );
    if (result.locked)
      return Response.json(
        { processed: 0, skipped: true, reasonCode: "REDIS_LOCK_BUSY" },
        { headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(result.result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const id = requestId();
    console.error("cron_automations_failed", {
      requestId: id,
      code:
        error instanceof Error && "code" in error
          ? String((error as { code?: unknown }).code)
          : "UNKNOWN",
    });
    return errorResponse(
      "CRON_RUN_FAILED",
      "Az automatizmusok futtatása átmenetileg nem sikerült.",
      503,
      id,
    );
  }
}
