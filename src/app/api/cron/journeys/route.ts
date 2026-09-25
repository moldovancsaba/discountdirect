import { errorResponse } from "@/auth/http";
import { matchesToken } from "@/lib/operator-session";
import { withRedisLock } from "@/lib/redis-core";
import { runDueJourneySteps } from "@/journeys/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matchesToken(token, process.env.CRON_SECRET))
    return errorResponse("UNAUTHORIZED", "Cron hozzáférés szükséges.", 401);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const result = await withRedisLock("cron", "journeys", () =>
    runDueJourneySteps(Number.isFinite(limit) ? limit : 20),
  );
  if (result.locked)
    return Response.json(
      { processed: 0, skipped: true, reasonCode: "REDIS_LOCK_BUSY" },
      { headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(result.result, {
    headers: { "Cache-Control": "no-store" },
  });
}
