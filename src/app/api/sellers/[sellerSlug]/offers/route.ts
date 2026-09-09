import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { offerError } from "@/offers/http";
import { createOffer } from "@/offers/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) { const user = await currentUser(); if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401); const parsed = await jsonBody(request); if (parsed.response) return parsed.response; try { return Response.json({ offer: await createOffer(user.id, (await params).sellerSlug, parsed.body) }, { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (error) { return offerError(error); } }
