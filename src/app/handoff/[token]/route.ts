import { consumeOfferHandoff } from "@/handoff/service";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){try{const result=await consumeOfferHandoff((await params).token);return Response.redirect(result,303);}catch{const url=new URL("/buyer/offers",request.url);url.searchParams.set("error","CHECKOUT_UNAVAILABLE");return Response.redirect(url,303);}}
