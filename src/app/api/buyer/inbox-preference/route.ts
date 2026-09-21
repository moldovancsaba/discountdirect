import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { messagingError } from "@/messaging/http";
import { buyerInbox, saveBuyerInboxPreference } from "@/messaging/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { const user = await currentUser(); if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401); try { const result = await buyerInbox(user.id); return Response.json({ preference: result.preference, sellers: result.sellers }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return messagingError(error); } }
export async function PATCH(request: Request) { const user = await currentUser(); if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401); const parsed = await jsonBody(request, 2048); if (parsed.response) return parsed.response; const body = parsed.body as Record<string, unknown>; try { return Response.json(await saveBuyerInboxPreference(user.id, { mode: body.mode, sellerId: body.sellerId }, Number(body.expectedVersion)), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return messagingError(error); } }
