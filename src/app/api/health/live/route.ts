export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { status: "ok", service: "discountdirect", version: "1.0.0" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
