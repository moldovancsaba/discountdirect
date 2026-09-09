import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { messagingError } from "@/messaging/http";
import { buyerConversations } from "@/messaging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try { return Response.json(await buyerConversations(user.id, new URL(request.url).searchParams.get("cursor")), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return messagingError(error); }
}
