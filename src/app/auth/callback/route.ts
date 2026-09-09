import { handleSsoCallback } from "@/auth/oidc-callback";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleSsoCallback(request, 1);
