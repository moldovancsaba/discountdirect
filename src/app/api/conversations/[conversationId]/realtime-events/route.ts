import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { realtimeError } from "@/realtime/http";
import { replayRealtimeEvents } from "@/realtime/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try { return Response.json(await replayRealtimeEvents(user.id, (await params).conversationId, new URL(request.url).searchParams.get("cursor")), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return realtimeError(error); }
}
