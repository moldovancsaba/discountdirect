import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { privacyError } from "@/privacy/http";
import { buyerPrivacyExport } from "@/privacy/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    const payload = await buyerPrivacyExport(user.id, (await params).sellerSlug, new URL(request.url).searchParams.get("requestId") ?? "");
    return new Response(JSON.stringify(payload, null, 2), { headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=discountdirect-adatmasolat.json" } });
  } catch (error) { return privacyError(error); }
}
