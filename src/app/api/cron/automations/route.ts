import { errorResponse } from "@/auth/http";
import { matchesToken } from "@/lib/operator-session";
import { runDueAutomations } from "@/automations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matchesToken(token, process.env.CRON_SECRET)) return errorResponse("UNAUTHORIZED", "Cron hozzáférés szükséges.", 401);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const result = await runDueAutomations(Number.isFinite(limit) ? limit : 20);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
