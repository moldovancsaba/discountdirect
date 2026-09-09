import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { purchaseError } from "@/purchases/http";
import { updateCustomerPrivacy } from "@/purchases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ sellerSlug: string; customerId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const { sellerSlug, customerId } = await params;
    const customer = await updateCustomerPrivacy(user.id, sellerSlug, customerId, (parsed.body as { status?: unknown }).status);
    return Response.json({ customer }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return purchaseError(error); }
}
