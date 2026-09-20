import { errorResponse } from "@/auth/http";
import { processDueDeliveries } from "@/delivery/service";
import { matchesToken } from "@/lib/operator-session";
import { processPostalSubmissions } from "@/postal/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matchesToken(token, process.env.CRON_SECRET)) return errorResponse("UNAUTHORIZED", "Cron hozzáférés szükséges.", 401);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const bounded=Number.isFinite(limit)?limit:20;
  const [deliveries,postal]=await Promise.all([processDueDeliveries(bounded),processPostalSubmissions(Math.min(10,bounded))]);
  return Response.json({deliveries,postal}, { headers: { "Cache-Control": "no-store" } });
}
