import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { automationError } from "@/automations/http";
import { buyerOfferLists } from "@/automations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    return Response.json(await buyerOfferLists(user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return automationError(error);
  }
}
