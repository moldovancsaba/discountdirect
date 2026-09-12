import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { redemptionError } from "@/redemptions/http";
import { confirmRedemption } from "@/redemptions/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const { sellerSlug } = await params;
    const body = parsed.body as { code?: unknown };
    return Response.json({ coupon: await confirmRedemption(user.id, sellerSlug, body.code) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return redemptionError(error);
  }
}
