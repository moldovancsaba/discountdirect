import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { privacyError } from "@/privacy/http";
import { acknowledgePrivacySla } from "@/privacy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ sellerSlug: string; requestId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    const { sellerSlug, requestId } = await params;
    return Response.json({ request: await acknowledgePrivacySla(user.id, sellerSlug, requestId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return privacyError(error); }
}
