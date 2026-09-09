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
  for (const authModel of authModels) await authModel.createIndexes();

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
    "Authentication integration passed: session, revocation, activation replay, durable rate limit and tenant denial.",
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
