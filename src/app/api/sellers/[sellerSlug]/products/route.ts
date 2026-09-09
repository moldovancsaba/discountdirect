import { currentUser } from "@/auth/service";
import { errorResponse } from "@/auth/http";
import { catalogError, jsonBody } from "@/catalog/http";
import { createProduct, listProducts } from "@/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  try {
    const { sellerSlug } = await params;
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") !== "false";
    const result = await listProducts(user.id, sellerSlug, includeArchived);
    return Response.json({ products: result.products }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return catalogError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) return errorResponse("UNAUTHORIZED", "Bejelentkezés szükséges.", 401);
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  try {
    const { sellerSlug } = await params;
    const product = await createProduct(user.id, sellerSlug, parsed.body);
    return Response.json({ product }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return catalogError(error);
  }
}
