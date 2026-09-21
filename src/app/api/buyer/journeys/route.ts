import { currentUser } from "@/auth/service"; import { errorResponse } from "@/auth/http"; import { journeyError } from "@/journeys/http"; import { buyerJourneyEvidence } from "@/journeys/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { const user = await currentUser(); if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401); try { return Response.json(await buyerJourneyEvidence(user.id), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return journeyError(error); } }
