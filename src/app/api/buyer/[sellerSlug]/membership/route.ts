import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { getMembership, joinMembership, leaveMembership } from "@/membership/service";
import { membershipError } from "@/membership/http";

export async function GET(_request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try { return Response.json(await getMembership(user.id, (await params).sellerSlug), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return membershipError(error); }
}

export async function POST(_request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try { return Response.json(await joinMembership(user.id, (await params).sellerSlug), { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (error) { return membershipError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  const version = Number((parsed.body as Record<string, unknown>).version);
  if (!Number.isInteger(version) || version < 1) return errorResponse("INVALID_MEMBERSHIP", "Érvényes tagsági verzió szükséges.", 400);
  try { return Response.json(await leaveMembership(user.id, (await params).sellerSlug, version), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return membershipError(error); }
}
