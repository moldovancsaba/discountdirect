import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { privacyError } from "@/privacy/http";
import { advancePrivacyRequest } from "@/privacy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ sellerSlug: string; requestId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const { sellerSlug, requestId } = await params;
    const body = parsed.body as { status?: unknown; resolution?: unknown };
    const result = await advancePrivacyRequest(user.id, sellerSlug, requestId, body.status, body.resolution);
    return Response.json({ request: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return privacyError(error); }
}
