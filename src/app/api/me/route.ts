import {
  currentUser,
  buyerRelationshipsFor,
  membershipsFor,
} from "@/auth/service";
import { errorResponse } from "@/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await currentUser();
    if (!user)
      return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
    const [memberships, relationships] = await Promise.all([
      membershipsFor(user.id),
      buyerRelationshipsFor(user.id),
    ]);
    return Response.json(
      {
        user,
        sellerMemberships: memberships.map(
          ({ sellerId, name, slug, role }) => ({ sellerId, name, slug, role }),
        ),
        buyerRelationships: relationships.map(({ sellerId, name, slug }) => ({
          sellerId,
          name,
          slug,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return errorResponse(
      "AUTH_UNAVAILABLE",
      "A fiókadatok átmenetileg nem érhetők el.",
      503,
    );
  }
}
