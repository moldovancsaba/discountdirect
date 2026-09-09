import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { privacyError } from "@/privacy/http";
import { sellerPrivacyRequests } from "@/privacy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    const result = await sellerPrivacyRequests(user.id, (await params).sellerSlug);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return privacyError(error); }
}
