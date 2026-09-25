import { errorResponse } from "@/auth/http";
import { matchesToken } from "@/lib/operator-session";
import { rebuildDueMetrics } from "@/reporting/service";
import { evaluatePrivacySla } from "@/privacy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matchesToken(token, process.env.CRON_SECRET)) return errorResponse("UNAUTHORIZED", "Cron hozzáférés szükséges.", 401);
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? 10);
  const limit = Number.isFinite(requested) ? requested : 10;
  const [metrics, privacy] = await Promise.all([rebuildDueMetrics(limit), evaluatePrivacySla(limit)]);
  return Response.json({ metrics, privacy }, { headers: { "Cache-Control": "no-store" } });
}
