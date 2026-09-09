import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { catalogError, jsonBody } from "@/catalog/http";
import { updateProduct } from "@/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ sellerSlug: string; productId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body as { product?: unknown; expectedVersion?: unknown };
  try {
    const { sellerSlug, productId } = await params;
    const product = await updateProduct(user.id, sellerSlug, productId, body.product, body.expectedVersion);
    return Response.json({ product }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return catalogError(error);
  }
}
