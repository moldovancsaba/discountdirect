import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { offerError } from "@/offers/http";
import { withdrawOffer } from "@/offers/service";
export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string; offerId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request); if (parsed.response) return parsed.response;
  const body = parsed.body as { expectedVersion?: unknown };
  try { const value = await params; return Response.json({ offer: await withdrawOffer(user.id, value.sellerSlug, value.offerId, body.expectedVersion) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return offerError(error); }
}
