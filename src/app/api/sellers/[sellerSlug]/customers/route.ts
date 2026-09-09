import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { purchaseError } from "@/purchases/http";
import { listCustomers } from "@/purchases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    const { sellerSlug } = await params;
    const result = await listCustomers(user.id, sellerSlug);
    return Response.json({ customers: result.customers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return purchaseError(error); }
}
