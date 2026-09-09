export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { status: "ok", service: "discountdirect", version: "0.7.0" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
