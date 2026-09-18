import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { settingsError } from "@/settings/http";
import { getSellerSettings, updateSellerSettings } from "@/settings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    const result = await getSellerSettings(user.id, (await params).sellerSlug);
    return Response.json({ market: result.market, settings: result.settings, version: result.version }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return settingsError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const body = parsed.body as { settings?: unknown; expectedVersion?: unknown };
    return Response.json(await updateSellerSettings(user.id, (await params).sellerSlug, body.settings, body.expectedVersion), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return settingsError(error); }
}
