import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import {
  AccessToken,
  BuyerRelationship,
  Membership,
  Seller,
  User,
  authModels,
} from "../src/auth/models.ts";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
} from "../src/auth/crypto.ts";
import { catalogModels, Product } from "../src/catalog/models.ts";
import { Customer, Purchase, purchaseModels } from "../src/purchases/models.ts";
import { ChannelPreference, ConsentEvent, PrivacyRequest, privacyModels } from "../src/privacy/models.ts";
import { RecommendationPreview, recommendationModels } from "../src/recommendations/models.ts";
import { Conversation, ConversationEvent, messagingModels } from "../src/messaging/models.ts";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");
const databaseName = `discountdirect_auth_verify_${randomBytes(5).toString("hex")}`;
if (!databaseName.startsWith("discountdirect_auth_verify_")) {
  throw new Error("Unsafe verification database name");
}
const port = 31_000 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const app = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  {
    env: { ...process.env, MONGODB_DB: databaseName },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverOutput = "";
app.stdout.on("data", (chunk) => (serverOutput += chunk.toString()));
app.stderr.on("data", (chunk) => (serverOutput += chunk.toString()));

async function waitUntilReady() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health/live`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Verification server did not start: ${serverOutput.slice(-500)}`,
  );
}

function cookieFrom(response: Response) {
  const value = response.headers
    .get("set-cookie")
    ?.match(/discountdirect-session=([^;]+)/)?.[1];
  assert.ok(value, "session cookie is missing");
  return `discountdirect-session=${value}`;
}

async function post(path: string, body: unknown, cookie?: string) {
  return fetch(`${base}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      origin: base,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

try {
  await waitUntilReady();
  await mongoose.connect(uri, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000,
    autoIndex: false,
  });
  for (const dataModel of [...authModels, ...catalogModels, ...purchaseModels, ...privacyModels, ...recommendationModels, ...messagingModels])
    await dataModel.createIndexes();

  const password = "Verification password 2026";
  const user = await User.create({
    emailNormalized: "seller.verify@example.test",
    displayName: "Verification Seller",
    passwordHash: await hashPassword(password),
    status: "active",
  });
  const [allowedSeller, foreignSeller] = await Seller.create([
    { name: "Allowed Seller", slug: "allowed-seller" },
    { name: "Foreign Seller", slug: "foreign-seller" },
  ]);
  await Membership.create({
    sellerId: allowedSeller._id,
    userId: user._id,
    role: "owner",
    status: "active",
  });
  await BuyerRelationship.create({
    sellerId: allowedSeller._id,
    buyerUserId: user._id,
    status: "active",
  });

  const login = await post("/api/auth/session", {
    email: "SELLER.verify@example.test",
    password,
  });
  assert.equal(login.status, 201);
  const cookie = cookieFrom(login);
  const me = await fetch(`${base}/api/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  const profile = await me.json();
  assert.deepEqual(
    profile.sellerMemberships.map((item: { slug: string }) => item.slug),
    ["allowed-seller"],
  );
  assert.deepEqual(
    profile.buyerRelationships.map((item: { slug: string }) => item.slug),
    ["allowed-seller"],
  );
  assert.equal(
    (
      await fetch(`${base}/seller/allowed-seller`, {
        headers: { cookie },
        redirect: "manual",
      })
    ).status,
    200,
  );
  assert.ok(
    [303, 307].includes(
      (
        await fetch(`${base}/seller/${foreignSeller.slug}`, {
          headers: { cookie },
          redirect: "manual",
        })
      ).status,
    ),
  );

  const productPath = "/api/sellers/allowed-seller/products";
  const productInput = {
    sku: "TV-001",
    name: "Okostelevízió",
    priceHuf: 199_990,
    stock: 4,
    category: "Televízió",
    compatibleWith: ["HDMI"],
    active: true,
  };
  const created = await post(productPath, productInput, cookie);
  assert.equal(created.status, 201);
  const createdProduct = (await created.json()).product;
  assert.equal((await post(productPath, productInput, cookie)).status, 409);
  assert.equal(
    (await post(productPath, { ...productInput, sku: "BAD", priceHuf: -1 }, cookie))
      .status,
    400,
  );
  assert.equal(
    (
      await post(
        "/api/sellers/foreign-seller/products",
        { ...productInput, sku: "FOREIGN" },
        cookie,
      )
    ).status,
    403,
  );

  const importRows = [
    { ...productInput, name: "Okostelevízió Plus", stock: 6 },
    {
      sku: "CAB-001",
      name: "HDMI kábel",
      priceHuf: 4990,
      stock: 20,
      category: "Kiegészítő",
      compatibleWith: ["TV-001"],
      active: true,
    },
  ];
  const preview = await post(
    `${productPath}/import`,
    { schemaVersion: "1", rows: importRows },
    cookie,
  );
  assert.equal(preview.status, 201);
  const previewBody = await preview.json();
  assert.deepEqual(
    previewBody.batch.rows.map((row: { action: string }) => row.action),
    ["update", "create"],
  );
  assert.equal(
    (
      await post(
        `${productPath}/import`,
        { action: "apply", batchId: previewBody.batch._id },
        cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await post(
        `${productPath}/import`,
        { action: "apply", batchId: previewBody.batch._id },
        cookie,
      )
    ).status,
    200,
  );
  assert.equal(await Product.countDocuments({ sellerId: allowedSeller._id }), 2);

  const stalePreview = await post(
    `${productPath}/import`,
    {
      schemaVersion: "1",
      rows: [{ ...productInput, name: "Importból érkező név", stock: 7 }],
    },
    cookie,
  );
  const staleBatch = (await stalePreview.json()).batch;
  const currentProduct = await Product.findById(createdProduct.id).lean();
  assert.ok(currentProduct);
  const directEdit = await fetch(`${base}${productPath}/${createdProduct.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: base, cookie },
    body: JSON.stringify({
      expectedVersion: currentProduct.version,
      product: { ...productInput, name: "Közvetlen szerkesztés", stock: 8 },
    }),
  });
  assert.equal(directEdit.status, 200);
  assert.equal(
    (
      await post(
        `${productPath}/import`,
        { action: "apply", batchId: staleBatch._id },
        cookie,
      )
    ).status,
    409,
  );
  const editedProduct = (await directEdit.json()).product;
  const archived = await fetch(`${base}${productPath}/${createdProduct.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: base, cookie },
    body: JSON.stringify({
      expectedVersion: editedProduct.version,
      product: { ...productInput, name: editedProduct.name, stock: 8, active: false },
    }),
  });
  assert.equal(archived.status, 200);
  const activeOnly = await fetch(`${base}${productPath}?includeArchived=false`, {
    headers: { cookie },
  });
  assert.equal(activeOnly.status, 200);
  assert.deepEqual(
    (await activeOnly.json()).products.map((product: { sku: string }) => product.sku),
    ["CAB-001"],
  );

  const purchaseImportPath = "/api/sellers/allowed-seller/purchases/import";
  const purchaseRows = [
    { externalBuyerId: "CUSTOMER-1", buyerEmail: user.emailNormalized, buyerName: "Verification Buyer", orderId: "ORDER-1", lineId: "1", productSku: "CAB-001", productName: "HDMI kábel", purchasedAt: "2026-08-02T10:00:00.000Z", quantity: 2, totalHuf: 9980 },
    { externalBuyerId: "CUSTOMER-1", buyerEmail: user.emailNormalized, buyerName: "Verification Buyer", orderId: "ORDER-2", lineId: "1", productSku: "MISSING-001", productName: "Korábbi termék", purchasedAt: "2026-08-01T10:00:00.000Z", quantity: 1, totalHuf: 2990 },
  ];
  const purchasePreview = await post(purchaseImportPath, { schemaVersion: "1", sourceName: "Verification export", rows: purchaseRows }, cookie);
  assert.equal(purchasePreview.status, 201);
  const purchaseBatch = (await purchasePreview.json()).batch;
  assert.deepEqual(purchaseBatch.rows.map((row: { action: string }) => row.action), ["create", "create"]);
  assert.equal((await post(purchaseImportPath, { action: "apply", batchId: purchaseBatch._id }, cookie)).status, 200);
  assert.equal((await post(purchaseImportPath, { action: "apply", batchId: purchaseBatch._id }, cookie)).status, 200);
  assert.equal(await Purchase.countDocuments({ sellerId: allowedSeller._id }), 2);
  assert.equal((await Purchase.findOne({ sellerId: allowedSeller._id, productSku: "MISSING-001" }).lean())?.productId, null);

  const duplicatePreview = await post(purchaseImportPath, { schemaVersion: "1", sourceName: "Duplicate test", rows: [purchaseRows[0], purchaseRows[0]] }, cookie);
  assert.equal(duplicatePreview.status, 201);
  assert.equal((await duplicatePreview.json()).batch.rows[1].action, "error");
  const customersResponse = await fetch(`${base}/api/sellers/allowed-seller/customers`, { headers: { cookie } });
  assert.equal(customersResponse.status, 200);
  const customers = (await customersResponse.json()).customers;
  assert.equal(customers.length, 1);
  assert.equal(customers[0].totalHuf, 12_970);
  const historyResponse = await fetch(`${base}/api/sellers/allowed-seller/customers/${customers[0].id}/purchases?limit=1`, { headers: { cookie } });
  assert.equal(historyResponse.status, 200);
  const history = (await historyResponse.json()).purchases;
  assert.equal(history.length, 1);
  assert.equal(history[0].orderId, "ORDER-1");
  const refund = await fetch(`${base}/api/sellers/allowed-seller/purchases/${history[0].id}`, { method: "PATCH", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify({ expectedVersion: history[0].version, status: "refunded", reason: "Verification refund" }) });
  assert.equal(refund.status, 200);
  assert.equal((await fetch(`${base}/api/sellers/allowed-seller/customers`, { headers: { cookie } }).then((response) => response.json())).customers[0].totalHuf, 2990);
  assert.equal((await fetch(`${base}/api/sellers/allowed-seller/purchases/${history[0].id}`, { method: "PATCH", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify({ expectedVersion: history[0].version, status: "corrected", reason: "Stale correction" }) })).status, 409);
  assert.equal((await fetch(`${base}/api/sellers/foreign-seller/customers`, { headers: { cookie } })).status, 403);
  await Customer.create({ sellerId: foreignSeller._id, externalBuyerId: "FOREIGN-CUSTOMER", emailNormalized: user.emailNormalized, displayName: "Same email, other seller", sourceName: "Verification" });
  assert.equal(await Customer.countDocuments({ emailNormalized: user.emailNormalized }), 2);
  const buyerPage = await fetch(`${base}/buyer/allowed-seller`, { headers: { cookie } });
  assert.equal(buyerPage.status, 200);
  assert.match(await buyerPage.text(), /Korábbi termék/);

  const preferencesPath = "/api/buyer/allowed-seller/preferences";
  const initialPreferences = await fetch(`${base}${preferencesPath}`, { headers: { cookie } });
  assert.equal(initialPreferences.status, 200);
  assert.deepEqual((await initialPreferences.json()).preferences.map((item: { subscribed: boolean }) => item.subscribed), [false, false]);
  assert.equal((await fetch(`${base}${preferencesPath}`, { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ email: true, postal: false }) })).status, 403);
  const preferenceUpdate = await fetch(`${base}${preferencesPath}`, { method: "PATCH", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify({ email: true, postal: false }) });
  assert.equal(preferenceUpdate.status, 200);
  assert.equal(await ChannelPreference.countDocuments({ sellerId: allowedSeller._id, buyerUserId: user._id }), 2);
  assert.equal(await ConsentEvent.countDocuments({ sellerId: allowedSeller._id, buyerUserId: user._id }), 1);
  assert.equal((await fetch(`${base}${preferencesPath}`, { method: "PATCH", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify({ email: true, postal: false }) })).status, 200);
  assert.equal(await ConsentEvent.countDocuments({ sellerId: allowedSeller._id, buyerUserId: user._id }), 1);
  const preferencesPage = await fetch(`${base}/buyer/allowed-seller/preferences`, { headers: { cookie } });
  assert.equal(preferencesPage.status, 200);
  assert.match(await preferencesPage.text(), /Marketingcsatornák/);
  assert.equal((await fetch(`${base}/api/buyer/foreign-seller/preferences`, { headers: { cookie } })).status, 403);

  assert.equal((await post(productPath, { sku: "REC-001", name: "Ajánlott kiegészítő", priceHuf: 7990, stock: 5, category: "Kiegészítő", compatibleWith: ["MISSING-001"], active: true }, cookie)).status, 201);
  const recommendationsPath = `/api/sellers/allowed-seller/customers/${customers[0].id}/recommendations`;
  const recommendationResponse = await post(recommendationsPath, { channel: "email" }, cookie);
  assert.equal(recommendationResponse.status, 201);
  const recommendation = (await recommendationResponse.json()).preview;
  assert.equal(recommendation.status, "eligible");
  assert.equal(recommendation.recommendations[0].productSku, "REC-001");
  assert.equal(recommendation.recommendations[0].reasonCode, "COMPATIBLE_ACCESSORY");
  const recommendationReplay = (await (await post(recommendationsPath, { channel: "email" }, cookie)).json()).preview;
  assert.equal(recommendationReplay.id, recommendation.id);
  assert.equal(await RecommendationPreview.countDocuments({ sellerId: allowedSeller._id, customerId: customers[0].id }), 1);
  assert.equal((await post(`/api/sellers/foreign-seller/customers/${customers[0].id}/recommendations`, { channel: "email" }, cookie)).status, 403);

  const privacyRequestPath = "/api/buyer/allowed-seller/privacy-requests";
  const exportRequestResponse = await post(privacyRequestPath, { type: "access_export" }, cookie);
  assert.equal(exportRequestResponse.status, 201);
  const exportRequest = (await exportRequestResponse.json()).request;
  assert.equal((await post(privacyRequestPath, { type: "access_export" }, cookie)).status, 201);
  assert.equal(await PrivacyRequest.countDocuments({ sellerId: allowedSeller._id, buyerUserId: user._id, type: "access_export" }), 1);
  const sellerPrivacyPage = await fetch(`${base}/seller/allowed-seller/privacy`, { headers: { cookie } });
  assert.equal(sellerPrivacyPage.status, 200);
  assert.match(await sellerPrivacyPage.text(), /Feldolgozási sor/);
  const sellerRequestPath = `/api/sellers/allowed-seller/privacy-requests/${exportRequest.id}`;
  assert.equal((await fetch(`${base}${sellerRequestPath}`, { method: "PATCH", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify({ status: "completed", resolution: "Invalid direct transition" }) })).status, 409);
  assert.equal((await fetch(`${base}${sellerRequestPath}`, { method: "PATCH", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify({ status: "processing", resolution: "Identity verified" }) })).status, 200);
  assert.equal((await fetch(`${base}${sellerRequestPath}`, { method: "PATCH", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify({ status: "completed", resolution: "Export prepared" }) })).status, 200);
  const exportDownload = await fetch(`${base}/api/buyer/allowed-seller/privacy-export?requestId=${exportRequest.id}`, { headers: { cookie } });
  assert.equal(exportDownload.status, 200);
  const exportPayload = await exportDownload.json();
  assert.equal(exportPayload.purchases.length, 2);
  assert.equal(exportPayload.preferences.find((item: { channel: string }) => item.channel === "email").status, "subscribed");

  const restrictionRequest = (await (await post(privacyRequestPath, { type: "restriction" }, cookie)).json()).request;
  const restrictionPath = `/api/sellers/allowed-seller/privacy-requests/${restrictionRequest.id}`;
  assert.equal((await fetch(`${base}${restrictionPath}`, { method: "PATCH", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify({ status: "processing", resolution: "Identity verified" }) })).status, 200);
  assert.equal((await fetch(`${base}${restrictionPath}`, { method: "PATCH", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify({ status: "completed", resolution: "Processing restricted" }) })).status, 200);
  assert.equal((await Customer.findOne({ sellerId: allowedSeller._id, emailNormalized: user.emailNormalized }).lean())?.privacyStatus, "restricted");
  assert.equal(await ChannelPreference.countDocuments({ sellerId: allowedSeller._id, buyerUserId: user._id, status: "subscribed" }), 0);
  assert.equal((await fetch(`${base}${preferencesPath}`, { method: "PATCH", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify({ email: true, postal: false }) })).status, 409);

  const buyerPassword = "Conversation buyer password 2026";
  const conversationBuyer = await User.create({
    emailNormalized: "conversation.buyer@example.test",
    displayName: "Conversation Buyer",
    passwordHash: await hashPassword(buyerPassword),
    status: "active",
  });
  await BuyerRelationship.create({ sellerId: allowedSeller._id, buyerUserId: conversationBuyer._id, status: "active" });
  const conversationCustomer = await Customer.create({ sellerId: allowedSeller._id, externalBuyerId: "CONVERSATION-CUSTOMER", emailNormalized: conversationBuyer.emailNormalized, displayName: "Conversation Buyer", sourceName: "Verification" });
  const buyerLogin = await post("/api/auth/session", { email: conversationBuyer.emailNormalized, password: buyerPassword });
  assert.equal(buyerLogin.status, 201);
  const buyerCookie = cookieFrom(buyerLogin);
  const conversationsPath = `/api/sellers/allowed-seller/customers/${conversationCustomer._id}/conversations`;
  const conversationResponse = await post(conversationsPath, {}, cookie);
  assert.equal(conversationResponse.status, 201);
  const conversation = (await conversationResponse.json()).conversation;
  assert.equal((await post(conversationsPath, {}, cookie)).status, 201);
  assert.equal(await Conversation.countDocuments({ sellerId: allowedSeller._id, buyerUserId: conversationBuyer._id }), 1);
  const messagesPath = `/api/conversations/${conversation.id}/messages`;
  const sent = await post(messagesPath, { clientRequestId: "seller-message-001", body: "Szia, van egy kérdésünk a rendelésedről." }, cookie);
  assert.equal(sent.status, 201);
  const message = (await sent.json()).message;
  assert.equal((await post(messagesPath, { clientRequestId: "seller-message-001", body: "Szia, van egy kérdésünk a rendelésedről." }, cookie)).status, 201);
  assert.equal(await ConversationEvent.countDocuments({ conversationId: conversation.id, kind: "message" }), 1);
  const buyerConversations = await fetch(`${base}/api/conversations`, { headers: { cookie: buyerCookie } });
  assert.equal(buyerConversations.status, 200);
  assert.equal((await buyerConversations.json()).conversations[0].buyerUnreadCount, 1);
  const buyerTimeline = await fetch(`${base}${messagesPath}`, { headers: { cookie: buyerCookie } });
  assert.equal(buyerTimeline.status, 200);
  const timeline = await buyerTimeline.json();
  assert.equal(timeline.events.at(-1).id, message.id);
  assert.equal((await post(messagesPath, { clientRequestId: "buyer-message-001", body: "Köszönöm, válaszolok." }, buyerCookie)).status, 201);
  assert.equal((await fetch(`${base}/api/sellers/allowed-seller/conversations`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${base}${messagesPath}`, { headers: { cookie: "discountdirect-session=invalid" } })).status, 401);
  assert.equal((await fetch(`${base}${messagesPath}`, { headers: { cookie } })).status, 200);

  const activationToken = createOpaqueToken();
  const pending = await User.create({
    emailNormalized: "pending.verify@example.test",
    displayName: "Pending User",
    status: "pending",
  });
  await AccessToken.create({
    tokenHash: hashOpaqueToken(activationToken),
    userId: pending._id,
    purpose: "activation",
    expiresAt: new Date(Date.now() + 60_000),
    createdBy: "verification",
  });
  assert.equal(
    (await post("/api/auth/activate", { token: activationToken, password }))
      .status,
    200,
  );
  assert.equal(
    (await post("/api/auth/activate", { token: activationToken, password }))
      .status,
    400,
  );

  const logout = await fetch(`${base}/api/auth/session`, {
    method: "DELETE",
    headers: { origin: base, cookie },
  });
  assert.equal(logout.status, 204);
  assert.equal(
    (await fetch(`${base}/api/me`, { headers: { cookie } })).status,
    401,
  );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(
      (
        await post("/api/auth/session", {
          email: user.emailNormalized,
          password: "Wrong password value",
        })
      ).status,
      401,
    );
  }
  assert.equal(
    (
      await post("/api/auth/session", {
        email: user.emailNormalized,
        password: "Wrong password value",
      })
    ).status,
    429,
  );
  console.log(
    "Authentication, catalog, purchase-ledger, privacy, recommendation and conversation integration passed: tenant denial, idempotent imports, consent evidence, request deduplication, export, marketing suppression, reproducible ranking, durable message retries and participant-only timelines.",
  );
} finally {
  if (mongoose.connection.readyState) {
    const collections = await mongoose.connection
      .db!.listCollections()
      .toArray();
    for (const collection of collections) {
      await mongoose.connection.db!.collection(collection.name).drop();
    }
    await mongoose.disconnect();
  }
  app.kill("SIGTERM");
}
