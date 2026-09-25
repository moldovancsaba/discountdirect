import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { productWatchError } from "@/journeys/watch-http";
import { listProductWatches, upsertProductWatch } from "@/journeys/watch-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try { return Response.json(await listProductWatches(user.id, (await params).sellerSlug), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return productWatchError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try { return Response.json(await upsertProductWatch(user.id, (await params).sellerSlug, parsed.body), { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return productWatchError(error); }
}
