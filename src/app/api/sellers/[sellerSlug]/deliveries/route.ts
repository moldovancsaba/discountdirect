import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { deliveryError } from "@/delivery/http";
import { listSellerDeliveries } from "@/delivery/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    const { sellerSlug } = await params;
    return Response.json(await listSellerDeliveries(user.id, sellerSlug), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return deliveryError(error);
  }
}
