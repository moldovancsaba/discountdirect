import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { offerError } from "@/offers/http";
import { respondToOffer } from "@/offers/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) { const user = await currentUser(); if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401); const parsed = await jsonBody(request); if (parsed.response) return parsed.response; const body = parsed.body as { expectedVersion?: unknown; decision?: unknown }; try { return Response.json({ offer: await respondToOffer(user.id, (await params).offerId, body.expectedVersion, body.decision) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return offerError(error); } }
