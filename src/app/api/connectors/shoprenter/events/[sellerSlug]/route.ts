import { errorResponse } from "@/auth/http";
import {
  handleShoprenterEvent,
  shoprenterEventStatus,
} from "@/connectors/shoprenter-events";
import { redisRateLimit } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sellerSlug: string }> },
) {
  const sellerSlug = (await params).sellerSlug;
  const address = (
    request.headers.get("x-forwarded-for")?.split(",", 1)[0] ?? "unknown"
  )
    .trim()
    .slice(0, 64);
  const rate = await redisRateLimit(
    "shoprenter-webhook",
    `${sellerSlug}:${address}`,
    120,
  ).catch(() => ({
    enabled: false as const,
    accepted: true,
    reasonCode: "REDIS_UNAVAILABLE" as const,
  }));
  if (rate.enabled && !rate.accepted)
    return errorResponse(
      "RATE_LIMITED",
      "A Shoprenter események fogadási korlátját elérted.",
      429,
    );
  const raw = await request.text();
  try {
    const result = await handleShoprenterEvent(
      sellerSlug,
      raw,
      new URL(request.url).searchParams.get("secret"),
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = shoprenterEventStatus(error);
    return errorResponse(
      "SHOPRENTER_EVENT_REJECTED",
      "A Shoprenter esemény nem dolgozható fel.",
      status,
    );
  }
}
