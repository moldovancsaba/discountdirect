export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { status: "ok", service: "discountdirect", version: "1.4.1" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
