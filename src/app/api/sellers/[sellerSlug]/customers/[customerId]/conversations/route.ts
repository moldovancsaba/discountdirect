import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { isSameOrigin } from "@/auth/http";
import { messagingError } from "@/messaging/http";
import { ensureConversation } from "@/messaging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string; customerId: string }> }) {
  if (!isSameOrigin(request)) return errorResponse("INVALID_ORIGIN", "A kérés eredete nem engedélyezett.", 403);
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try { const { sellerSlug, customerId } = await params; return Response.json({ conversation: await ensureConversation(user.id, sellerSlug, customerId) }, { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return messagingError(error); }
}
