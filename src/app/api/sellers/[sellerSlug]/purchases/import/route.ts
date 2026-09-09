import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { purchaseError } from "@/purchases/http";
import { applyPurchaseImport, previewPurchaseImport } from "@/purchases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request, 524_288);
  if (parsed.response) return parsed.response;
  try {
    const { sellerSlug } = await params;
    const body = parsed.body as { action?: unknown; batchId?: unknown };
    const batch = body.action === "apply"
      ? await applyPurchaseImport(user.id, sellerSlug, String(body.batchId ?? ""))
      : await previewPurchaseImport(user.id, sellerSlug, body);
    return Response.json({ batch }, { status: body.action === "apply" ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return purchaseError(error); }
}
