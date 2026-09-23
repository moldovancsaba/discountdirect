import { errorResponse } from "@/auth/http";
import { handleShoprenterEvent, shoprenterEventStatus } from "@/connectors/shoprenter-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const raw = await request.text();
  try {
    const result = await handleShoprenterEvent((await params).sellerSlug, raw, new URL(request.url).searchParams.get("secret"));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = shoprenterEventStatus(error);
    return errorResponse("SHOPRENTER_EVENT_REJECTED", "A Shoprenter esemény nem dolgozható fel.", status);
  }
}
