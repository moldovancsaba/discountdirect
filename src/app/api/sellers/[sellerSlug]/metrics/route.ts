import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { sellerMetrics } from "@/reporting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function date(value: string | null) { if (!value) return undefined; const parsed = new Date(`${value}T00:00:00.000Z`); return Number.isNaN(parsed.getTime()) ? undefined : parsed; }

export async function GET(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const query = new URL(request.url).searchParams;
  const result = await sellerMetrics(user.id, (await params).sellerSlug, { from: date(query.get("from")), to: date(query.get("to")) }).catch(() => null);
  if (!result) return errorResponse("FORBIDDEN", "A riport nem érhető el.", 403);
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
