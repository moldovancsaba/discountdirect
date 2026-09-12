import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { automationError } from "@/automations/http";
import { setAutomationStatus } from "@/automations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ sellerSlug: string; automationId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const { sellerSlug, automationId } = await params;
    const body = parsed.body as { status?: unknown; expectedVersion?: unknown };
    return Response.json({ automation: await setAutomationStatus(user.id, sellerSlug, automationId, body.status, body.expectedVersion) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return automationError(error);
  }
}
