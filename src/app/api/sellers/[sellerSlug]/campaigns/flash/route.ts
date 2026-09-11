import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { campaignError } from "@/campaigns/http";
import { createFlashCampaign, listCampaigns } from "@/campaigns/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) { const user = await currentUser(); if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401); const parsed = await jsonBody(request); if (parsed.response) return parsed.response; try { return Response.json({ campaign: await createFlashCampaign(user.id, (await params).sellerSlug, parsed.body) }, { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (error) { return campaignError(error); } }
export async function GET(_request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) { const user = await currentUser(); if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401); try { return Response.json(await listCampaigns(user.id, (await params).sellerSlug), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return campaignError(error); } }
