import test from "node:test";
import assert from "node:assert/strict";
import { SHOPRENTER_REQUIRED_SCOPES, ShoprenterConnector } from "../src/connectors/providers/shoprenter.ts";
import { ProviderError } from "../src/connectors/transport.ts";
import { UnasConnector } from "../src/connectors/providers/unas.ts";

const configuration = { shopName: "demo", shopUrl: "https://demo.example/", checkoutUrlTemplate: "https://demo.example/search?q={sku}&ref={handoffId}" };

test("Shoprenter uses OAuth API2 and maps a bounded product page", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => { const url=String(input); calls.push({url,init}); if(url.includes("/app/token")) return Response.json({access_token:"token-token-token-token",expires_in:3600}); return Response.json({items:[{id:"p1",sku:"ABC-1",price:"12990.0000",status:"1",orderable:"1",dateUpdated:"2026-09-19T10:00:00Z"}],next:{href:"next"}}); };
  const connector = new ShoprenterConnector({clientId:"client-id",clientSecret:"client-secret-value"}, configuration, fetcher);
  const page = await connector.listProducts(null,new AbortController().signal);
  assert.equal(page.items[0]?.priceHuf,12990); assert.equal(page.nextCursor,"1"); assert.match(calls[0]!.url,/oauth\.app\.shoprenter\.net\/demo\/app\/token/); assert.match(calls[1]!.url,/demo\.api2\.myshoprenter\.hu\/api\/products/); assert.equal((calls[1]!.init?.headers as Record<string,string>).Authorization,"Bearer token-token-token-token");
});

test("Shoprenter documents least-privilege scopes and reuses an unexpired token", async () => {
  assert.deepEqual(SHOPRENTER_REQUIRED_SCOPES, ["product.product:read", "order.order:read", "store.webhook:read", "store.webhook:write"]);
  let tokenCalls = 0;
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes("/app/token")) { tokenCalls += 1; return Response.json({ access_token: "token-token-token-token", expires_in: 3600 }); }
    return Response.json({ items: [] });
  };
  const connector = new ShoprenterConnector({clientId:"client-id",clientSecret:"client-secret-value"}, configuration, fetcher);
  await connector.listProducts(null, new AbortController().signal);
  await connector.listOrders(null, new AbortController().signal);
  assert.equal(tokenCalls, 1);
});

test("Shoprenter rejects non-HUF orders and malformed fractional HUF", async () => {
  const bodies = [
    {items:[{id:"o1",currency:"EUR",totalGross:"12",dateCreated:"2026-09-20T10:00:00Z"}]},
    {items:[{id:"o2",currency:"HUF",totalGross:"12.5",dateCreated:"2026-09-20T10:00:00Z"}]},
  ];
  const fetcher: typeof fetch = async (input) => String(input).includes("/app/token")
    ? Response.json({access_token:"token-token-token-token",expires_in:3600})
    : Response.json(bodies.shift());
  const connector = new ShoprenterConnector({clientId:"client-id",clientSecret:"client-secret-value"}, configuration, fetcher);
  await assert.rejects(connector.listOrders(null,new AbortController().signal),(error:unknown)=>error instanceof ProviderError&&error.code==="INVALID_RESPONSE");
  await assert.rejects(connector.listOrders(null,new AbortController().signal),(error:unknown)=>error instanceof ProviderError&&error.code==="INVALID_RESPONSE");
});

test("UNAS logs in with API key and maps XML stock", async () => {
  const bodies:string[]=[];
  const fetcher:typeof fetch=async(input,init)=>{bodies.push(String(init?.body??""));if(String(input).endsWith("/login"))return new Response("<Login><Token>token-token</Token></Login>");return new Response("<Products><Product><Id>12</Id><Sku>ABC-1</Sku><Stocks><Stock><Qty>2</Qty></Stock><Stock><Qty>3</Qty></Stock></Stocks></Product></Products>");};
  const connector=new UnasConnector({apiKey:"api-key-value"},configuration,fetcher);const stock=await connector.getStock(["ABC-1"],new AbortController().signal);
  assert.equal(stock[0]?.quantity,5);assert.match(bodies[0]!,/<ApiKey>api-key-value<\/ApiKey>/);assert.match(bodies[1]!,/<Sku>ABC-1<\/Sku>/);
});

test("UNAS reuses a bearer token until its documented expiry", async () => {
  let loginCalls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/login")) { loginCalls += 1; return new Response("<Login><Token>token-token</Token><Expire>2099-01-01 00:00:00</Expire></Login>"); }
    assert.match(String(init?.body), /LimitNum/);
    return new Response("<Products><Product><Id>12</Id><Sku>ABC-1</Sku><Price>1000</Price><Statuses><Status><Type>base</Type><Value>1</Value></Status></Statuses></Product></Products>");
  };
  const connector = new UnasConnector({apiKey:"api-key-value"}, configuration, fetcher);
  await connector.listProducts(null, new AbortController().signal);
  await connector.listProducts("100", new AbortController().signal);
  assert.equal(loginCalls, 1);
});

test("provider checkout URL expands only the configured template",async()=>{const connector=new ShoprenterConnector({clientId:"client-id",clientSecret:"client-secret-value"},configuration,fetch);const result=await connector.createCheckout({handoffId:"handoff",offerId:"offer",productSku:"A B",quantity:1,priceHuf:1000,expiresAt:new Date()},new AbortController().signal);assert.equal(result.url,"https://demo.example/search?q=A%20B&ref=handoff");});
