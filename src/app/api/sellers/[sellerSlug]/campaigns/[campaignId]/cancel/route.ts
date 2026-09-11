import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { campaignError } from "@/campaigns/http";
import { cancelCampaign } from "@/campaigns/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(_request: Request, { params }: { params: Promise<{ sellerSlug: string; campaignId: string }> }) { const user = await currentUser(); if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401); const value = await params; try { return Response.json({ campaign: await cancelCampaign(user.id, value.sellerSlug, value.campaignId) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return campaignError(error); } }
