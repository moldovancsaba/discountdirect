import { databaseHealth } from "@/lib/database";
import { matchesToken } from "@/lib/operator-session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const token =
    request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (!matchesToken(token, process.env.OPERATIONS_TOKEN))
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Operator access required", requestId: crypto.randomUUID() } }, { status: 401, headers });
  const database = await databaseHealth();
  return Response.json(
    {
      status: database.connected ? "ready" : "unavailable",
      database,
      presence: { status: "not_instrumented", activeUsers: null },
    },
    { status: database.connected ? 200 : 503, headers },
  );
}
