import { errorResponse } from "@/auth/http";
import { matchesToken } from "@/lib/operator-session";
import { withRedisLock } from "@/lib/redis-core";
import { withTenantBypass } from "@/lib/tenant";
import {
  runBirthdayJourneyTriggers,
  runProductWatchTriggers,
  runDueJourneySteps,
} from "@/journeys/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matchesToken(token, process.env.CRON_SECRET))
    return errorResponse("UNAUTHORIZED", "Cron hozzáférés szükséges.", 401);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  let result;
  try {
    result = await withTenantBypass(
      "journey-cron-worker",
      async () =>
        await withRedisLock("cron", "journeys", async () => ({
          triggers: {
            birthday: await runBirthdayJourneyTriggers(50),
            productWatches: await runProductWatchTriggers(50),
          },
          steps: await runDueJourneySteps(Number.isFinite(limit) ? limit : 20),
        })),
    );
  } catch (error) {
    console.error("journey cron failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
      name: error instanceof Error ? error.name : typeof error,
    });
    return errorResponse("INTERNAL_ERROR", "Journey worker hiba.", 500);
  }
  if (result.locked)
    return Response.json(
      { processed: 0, skipped: true, reasonCode: "REDIS_LOCK_BUSY" },
      { headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(result.result, {
    headers: { "Cache-Control": "no-store" },
  });
}
