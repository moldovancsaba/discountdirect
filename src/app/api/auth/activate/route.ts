import { errorResponse, isSameOrigin } from "@/auth/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return errorResponse(
      "INVALID_ORIGIN",
      "A kérés eredete nem engedélyezett.",
      403,
    );
  return errorResponse(
    "SSO_ONLY",
    "A fiókokat a DoneIsBetter SSO kezeli.",
    410,
  );
}
