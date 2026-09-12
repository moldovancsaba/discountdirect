import { errorResponse } from "@/auth/http";
import { deliveryError } from "@/delivery/http";
import { suppressDeliveryBuyer } from "@/delivery/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function unsubscribe(request: Request) {
  const url = new URL(request.url);
  const deliveryId = url.searchParams.get("deliveryId") ?? "";
  const token = url.searchParams.get("token") ?? "";
  try {
    await suppressDeliveryBuyer(deliveryId, token);
    return new Response("Leiratkozás rögzítve.", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    return deliveryError(error);
  }
}

export async function GET(request: Request) {
  return unsubscribe(request);
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0] === "application/json") return errorResponse("UNSUPPORTED_UNSUBSCRIBE_BODY", "A leiratkozási hivatkozás paraméterei szükségesek.", 400);
  return unsubscribe(request);
}
