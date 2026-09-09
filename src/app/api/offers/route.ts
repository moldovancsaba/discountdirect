import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { offerError } from "@/offers/http";
import { buyerOffers } from "@/offers/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { const user = await currentUser(); if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401); try { return Response.json(await buyerOffers(user.id), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return offerError(error); } }
