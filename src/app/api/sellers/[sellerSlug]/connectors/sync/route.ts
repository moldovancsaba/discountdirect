import { currentUser } from "@/auth/service";
import { errorResponse, isSameOrigin } from "@/auth/http";
import { jsonBody } from "@/catalog/http";
import { connectorError } from "@/connectors/http";
import { syncConnector } from "@/connectors/service";

export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=30;
export async function POST(request:Request,{params}:{params:Promise<{sellerSlug:string}>}){const user=await currentUser();if(!user)return errorResponse("UNAUTHORIZED","Bejelentkezés szükséges.",401);if(!isSameOrigin(request))return errorResponse("INVALID_ORIGIN","Érvénytelen kérés.",403);const parsed=await jsonBody(request);if(parsed.response)return parsed.response;try{return Response.json(await syncConnector(user.id,(await params).sellerSlug,parsed.body),{headers:{"Cache-Control":"no-store"}});}catch(error){return connectorError(error);}}
