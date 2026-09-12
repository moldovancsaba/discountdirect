import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { automationError } from "@/automations/http";
import { runAutomationNow } from "@/automations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string; automationId: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request, 1024);
  if (parsed.response) return parsed.response;
  try {
    const { sellerSlug, automationId } = await params;
    return Response.json(await runAutomationNow(user.id, sellerSlug, automationId), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return automationError(error);
  }
}
