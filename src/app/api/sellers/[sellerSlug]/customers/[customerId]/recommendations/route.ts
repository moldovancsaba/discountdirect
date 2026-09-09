import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { recommendationError } from "@/recommendations/http";
import { createRecommendationPreview, recommendationPreview } from "@/recommendations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try { const result = await recommendationPreview(user.id, (await params).sellerSlug, new URL(request.url).searchParams.get("previewId") ?? ""); return Response.json({ preview: result }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return recommendationError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string; customerId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try { const { sellerSlug, customerId } = await params; const result = await createRecommendationPreview(user.id, sellerSlug, customerId, (parsed.body as { channel?: unknown }).channel); return Response.json({ preview: result }, { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return recommendationError(error); }
}
