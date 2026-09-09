import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { privacyError } from "@/privacy/http";
import { buyerPrivacy, updateBuyerPreferences } from "@/privacy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    const result = await buyerPrivacy(user.id, (await params).sellerSlug);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return privacyError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const result = await updateBuyerPreferences(user.id, (await params).sellerSlug, parsed.body);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return privacyError(error); }
}
