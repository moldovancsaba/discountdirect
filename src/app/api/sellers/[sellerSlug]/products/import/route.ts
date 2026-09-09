import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { catalogError, jsonBody } from "@/catalog/http";
import { applyImport, previewImport } from "@/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request, 262_144);
  if (parsed.response) return parsed.response;
  const body = parsed.body as { action?: unknown; batchId?: unknown };
  try {
    const { sellerSlug } = await params;
    const batch = body.action === "apply"
      ? await applyImport(user.id, sellerSlug, String(body.batchId ?? ""))
      : await previewImport(user.id, sellerSlug, parsed.body);
    return Response.json({ batch }, { status: body.action === "apply" ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return catalogError(error);
  }
}
