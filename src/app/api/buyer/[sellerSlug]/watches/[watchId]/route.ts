import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { productWatchError } from "@/journeys/watch-http";
import { cancelProductWatch } from "@/journeys/watch-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ sellerSlug: string; watchId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const value = await params;
    return Response.json(await cancelProductWatch(user.id, value.sellerSlug, value.watchId, Number((parsed.body as Record<string, unknown>).expectedVersion)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return productWatchError(error); }
}
