import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { isSameOrigin } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { messagingError } from "@/messaging/http";
import { conversationTimeline, sendConversationMessage } from "@/messaging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try { return Response.json(await conversationTimeline(user.id, (await params).conversationId, new URL(request.url).searchParams.get("cursor")), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return messagingError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  if (!isSameOrigin(request)) return errorResponse("INVALID_ORIGIN", "A kérés eredete nem engedélyezett.", 403);
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try { const body = parsed.body as { clientRequestId?: unknown; body?: unknown }; return Response.json({ message: await sendConversationMessage(user.id, (await params).conversationId, body.clientRequestId, body.body) }, { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return messagingError(error); }
}
