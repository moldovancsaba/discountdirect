import test from "node:test"; import assert from "node:assert/strict"; import { connectorProvider,safeCheckoutUrl } from "../src/connectors/contracts.ts";
test("connector providers are explicit",()=>{assert.equal(connectorProvider("shoprenter"),"shoprenter");assert.equal(connectorProvider("unas"),"unas");assert.equal(connectorProvider("other"),null);});
test("checkout redirects require https",()=>{assert.equal(safeCheckoutUrl("https://shop.example/cart"),"https://shop.example/cart");assert.throws(()=>safeCheckoutUrl("http://shop.example/cart"),/INSECURE_CHECKOUT_URL/);});
