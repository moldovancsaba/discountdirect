import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { settingsError } from "@/settings/http";
import { previewSellerRules } from "@/settings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const body = parsed.body as { settings?: unknown; overrideMode?: unknown };
    const mode = body.overrideMode === "predefined" ? "predefined" : "advanced";
    return Response.json(await previewSellerRules(user.id, (await params).sellerSlug, body.settings, mode), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return settingsError(error); }
}
