import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { purchaseError } from "@/purchases/http";
import { customerHistory } from "@/purchases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ sellerSlug: string; customerId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    const { sellerSlug, customerId } = await params;
    const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    const result = await customerHistory(user.id, sellerSlug, customerId, Number.isFinite(rawLimit) ? rawLimit : 50);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return purchaseError(error); }
}
