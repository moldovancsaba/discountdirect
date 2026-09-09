import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { privacyError } from "@/privacy/http";
import { createPrivacyRequest } from "@/privacy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const result = await createPrivacyRequest(user.id, (await params).sellerSlug, (parsed.body as { type?: unknown }).type);
    return Response.json({ request: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return privacyError(error); }
}
