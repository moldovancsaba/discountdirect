import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { purchaseError } from "@/purchases/http";
import { updatePurchaseStatus } from "@/purchases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ sellerSlug: string; purchaseId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const { sellerSlug, purchaseId } = await params;
    const body = parsed.body as { expectedVersion?: unknown; status?: unknown; reason?: unknown };
    const purchase = await updatePurchaseStatus(user.id, sellerSlug, purchaseId, body.expectedVersion, body.status, body.reason);
    return Response.json({ purchase }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return purchaseError(error); }
}
