import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { automationError } from "@/automations/http";
import { createAutomation, listAutomations } from "@/automations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    const { sellerSlug } = await params;
    return Response.json(await listAutomations(user.id, sellerSlug), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return automationError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const { sellerSlug } = await params;
    const automation = await createAutomation(user.id, sellerSlug, parsed.body);
    return Response.json({ automation }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return automationError(error);
  }
}
