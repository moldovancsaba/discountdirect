import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { io, type Socket } from "socket.io-client";
import {
  BuyerRelationship,
  Membership,
  Seller,
  Session,
  User,
} from "../src/auth/models.ts";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
} from "../src/auth/crypto.ts";
import { USER_SESSION_COOKIE } from "../src/auth/session-core.ts";
import { Conversation, ConversationEvent } from "../src/messaging/models.ts";
import {
  ConversationPresence,
  RealtimeEvent,
} from "../src/realtime/models.ts";

type ProbeArgs = {
  baseUrl: string;
  peerUrl: string;
  requireDistinctRuntime: boolean;
};

type RuntimeMeta = {
  instanceId?: string;
  deploymentId?: string;
  region?: string;
};

type SubscriptionAck = {
  ok?: boolean;
  events?: Array<{ eventId: string; occurredAt: string; messageId: string | null }>;
  meta?: RuntimeMeta;
  error?: { code?: string };
};

type SubscribedSocket = {
  socket: Socket;
  ack: SubscriptionAck;
};

const probeId = randomBytes(5).toString("hex");
const created = {
  sellerIds: [] as mongoose.Types.ObjectId[],
  userIds: [] as mongoose.Types.ObjectId[],
  conversationIds: [] as mongoose.Types.ObjectId[],
};

function parseArgs(): ProbeArgs {
  const values = new Map<string, string | boolean>();
  for (const arg of process.argv.slice(2)) {
    if (arg === "--require-distinct-runtime") values.set(arg, true);
    else if (arg.startsWith("--")) {
      const [key, value] = arg.split("=", 2);
      values.set(key, value ?? "");
    }
  }
  const baseUrl = String(values.get("--base-url") ?? process.env.APP_URL ?? "https://discountdirect.vercel.app").replace(/\/$/, "");
  const peerUrl = String(values.get("--peer-url") ?? baseUrl).replace(/\/$/, "");
  return {
    baseUrl,
    peerUrl,
    requireDistinctRuntime: values.get("--require-distinct-runtime") === true,
  };
}

function nowPlus(milliseconds: number, now = new Date()) {
  return new Date(now.getTime() + milliseconds);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || "discountdirect",
    serverSelectionTimeoutMS: 5000,
    autoIndex: false,
  });
}

async function createSession(user: { _id: mongoose.Types.ObjectId; authVersion: number }) {
  const token = createOpaqueToken();
  const now = new Date();
  await Session.create({
    tokenHash: hashOpaqueToken(token),
    userId: user._id,
    authVersion: user.authVersion,
    lastSeenAt: now,
    idleExpiresAt: nowPlus(30 * 60 * 1000, now),
    absoluteExpiresAt: nowPlus(12 * 60 * 60 * 1000, now),
    userAgentHash: `realtime-probe-${probeId}`,
  });
  return token;
}

async function seedSyntheticConversation() {
  const suffix = `realtime-probe-${probeId}`;
  const passwordHash = await hashPassword(`Realtime probe ${probeId}`);
  const [sellerUser, buyerUser, intruderUser] = await User.create([
    {
      emailNormalized: `${suffix}-seller@example.test`,
      displayName: "Realtime Probe Seller",
      passwordHash,
      status: "active",
    },
    {
      emailNormalized: `${suffix}-buyer@example.test`,
      displayName: "Realtime Probe Buyer",
      passwordHash,
      status: "active",
    },
    {
      emailNormalized: `${suffix}-intruder@example.test`,
      displayName: "Realtime Probe Intruder",
      passwordHash,
      status: "active",
    },
  ]);
  created.userIds.push(sellerUser._id, buyerUser._id, intruderUser._id);
  const seller = await Seller.create({
    name: "Realtime Probe Seller",
    slug: suffix,
    status: "active",
  });
  created.sellerIds.push(seller._id);
  await Membership.create({
    sellerId: seller._id,
    userId: sellerUser._id,
    role: "owner",
    status: "active",
  });
  await BuyerRelationship.create({
    sellerId: seller._id,
    buyerUserId: buyerUser._id,
    status: "active",
  });
  const conversation = await Conversation.create({
    sellerId: seller._id,
    buyerUserId: buyerUser._id,
    lastEventAt: new Date(),
    lastEventPreview: "Realtime probe conversation",
  });
  created.conversationIds.push(conversation._id);
  return {
    conversationId: conversation._id.toString(),
    sellerCookie: `${USER_SESSION_COOKIE}=${await createSession(sellerUser)}`,
    buyerCookie: `${USER_SESSION_COOKIE}=${await createSession(buyerUser)}`,
    intruderCookie: `${USER_SESSION_COOKIE}=${await createSession(intruderUser)}`,
  };
}

function waitForConnect(socket: Socket, label: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} socket timed out`)), 15_000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`${label} socket connect failed: ${error.message}`));
    });
  });
}

async function connectSocket(label: string, baseUrl: string, cookie: string) {
  const socket = io(baseUrl, {
    path: "/api/socket-io",
    transports: ["websocket"],
    addTrailingSlash: false,
    extraHeaders: { cookie },
    timeout: 15_000,
    reconnection: false,
    forceNew: true,
  });
  await waitForConnect(socket, label);
  return socket;
}

function emitWithAck(socket: Socket, event: string, payload: unknown) {
  return new Promise<SubscriptionAck>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), 15_000);
    socket.emit(event, payload, (result: SubscriptionAck) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

function realtimeCollector(socket: Socket, type: "message.created") {
  const events: Array<{ eventId: string; occurredAt: string; messageId: string | null }> = [];
  const waiters = new Map<string, (event: { eventId: string; occurredAt: string; messageId: string }) => void>();
  socket.on(type, (event: { eventId: string; occurredAt: string; messageId: string | null }) => {
    events.push(event);
    if (event.messageId && waiters.has(event.messageId)) {
      waiters.get(event.messageId)!({ ...event, messageId: event.messageId });
      waiters.delete(event.messageId);
    }
  });
  return {
    waitFor(messageId: string) {
      const existing = events.find((event) => event.messageId === messageId);
      if (existing?.messageId)
        return Promise.resolve({ ...existing, messageId: existing.messageId });
      return new Promise<{ eventId: string; occurredAt: string; messageId: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          waiters.delete(messageId);
          reject(new Error(`${type} timed out for ${messageId}`));
        }, 20_000);
        waiters.set(messageId, (event) => {
          clearTimeout(timeout);
          resolve(event);
        });
      });
    },
  };
}

async function sendMessage(baseUrl: string, cookie: string, conversationId: string, body: string) {
  const response = await fetch(`${baseUrl}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      cookie,
    },
    body: JSON.stringify({
      clientRequestId: `probe-${probeId}-${randomBytes(3).toString("hex")}`,
      body,
    }),
  });
  const text = await response.text();
  assert.equal(response.status, 201, text);
  return JSON.parse(text).message as { id: string };
}

function cursorFrom(event: { eventId: string; occurredAt: string }) {
  return Buffer.from(JSON.stringify({ at: event.occurredAt, id: event.eventId })).toString("base64url");
}

async function cleanup() {
  await ConversationPresence.deleteMany({ conversationId: { $in: created.conversationIds } });
  await RealtimeEvent.deleteMany({
    $or: [
      { conversationId: { $in: created.conversationIds } },
      { sellerId: { $in: created.sellerIds } },
    ],
  });
  await ConversationEvent.deleteMany({ conversationId: { $in: created.conversationIds } });
  await Conversation.deleteMany({ _id: { $in: created.conversationIds } });
  await Session.deleteMany({ userId: { $in: created.userIds } });
  await BuyerRelationship.deleteMany({
    $or: [
      { sellerId: { $in: created.sellerIds } },
      { buyerUserId: { $in: created.userIds } },
    ],
  });
  await Membership.deleteMany({
    $or: [
      { sellerId: { $in: created.sellerIds } },
      { userId: { $in: created.userIds } },
    ],
  });
  await Seller.deleteMany({ _id: { $in: created.sellerIds } });
  await User.deleteMany({ _id: { $in: created.userIds } });
}

function runtimeKey(meta?: RuntimeMeta) {
  return `${meta?.deploymentId ?? "unknown"}:${meta?.instanceId ?? "unknown"}`;
}

async function connectSubscribedSocket(
  label: string,
  baseUrl: string,
  cookie: string,
  conversationId: string,
  cursor?: string,
): Promise<SubscribedSocket> {
  const socket = await connectSocket(label, baseUrl, cookie);
  const ack = await emitWithAck(socket, "conversation.subscribe", {
    conversationId,
    ...(cursor ? { cursor } : {}),
  });
  assert.equal(ack.ok, true, JSON.stringify(ack));
  return { socket, ack };
}

async function connectBuyerSocket(
  args: ProbeArgs,
  cookie: string,
  conversationId: string,
  avoidedRuntime?: string,
) {
  if (!args.requireDistinctRuntime || !avoidedRuntime)
    return connectSubscribedSocket("buyer", args.peerUrl, cookie, conversationId);

  const candidateCount = 12;
  const candidates = await Promise.allSettled(
    Array.from({ length: candidateCount }, (_, index) =>
      connectSubscribedSocket(`buyer-${index + 1}`, args.peerUrl, cookie, conversationId),
    ),
  );
  const fulfilled = candidates.flatMap((candidate) =>
    candidate.status === "fulfilled" ? [candidate.value] : [],
  );
  const selected =
    fulfilled.find((candidate) => runtimeKey(candidate.ack.meta) !== avoidedRuntime) ??
    fulfilled[0];
  for (const candidate of fulfilled) {
    if (candidate !== selected) candidate.socket.close();
  }
  if (!selected) {
    const errors = candidates.flatMap((candidate) =>
      candidate.status === "rejected" ? [String(candidate.reason)] : [],
    );
    throw new Error(`buyer socket candidate batch failed: ${errors.join("; ")}`);
  }
  return selected;
}

const sockets: Socket[] = [];
const args = parseArgs();

try {
  await connectDatabase();
  const seeded = await seedSyntheticConversation();
  const sellerSocket = await connectSocket("seller", args.baseUrl, seeded.sellerCookie);
  sockets.push(sellerSocket);

  const sellerAck = await emitWithAck(sellerSocket, "conversation.subscribe", {
    conversationId: seeded.conversationId,
  });
  assert.equal(sellerAck.ok, true, JSON.stringify(sellerAck));
  const buyer = await connectBuyerSocket(
    args,
    seeded.buyerCookie,
    seeded.conversationId,
    runtimeKey(sellerAck.meta),
  );
  const buyerSocket = buyer.socket;
  const buyerAck = buyer.ack;
  sockets.push(buyerSocket);
  const buyerHeartbeatAck = await emitWithAck(buyerSocket, "presence.heartbeat", {
    conversationId: seeded.conversationId,
  });
  assert.equal(buyerHeartbeatAck.ok, true, JSON.stringify(buyerHeartbeatAck));
  assert.ok(
    await ConversationPresence.countDocuments({
      conversationId: seeded.conversationId,
      expiresAt: { $gt: new Date() },
    }),
    "presence row must be active after subscription",
  );
  const sellerEvents = realtimeCollector(sellerSocket, "message.created");
  const buyerEvents = realtimeCollector(buyerSocket, "message.created");

  const firstMessage = await sendMessage(
    args.baseUrl,
    seeded.sellerCookie,
    seeded.conversationId,
    `Realtime probe first message ${probeId}`,
  );
  const [sellerFirst, buyerFirst] = await Promise.all([
    sellerEvents.waitFor(firstMessage.id),
    buyerEvents.waitFor(firstMessage.id),
  ]);
  assert.equal(sellerFirst.messageId, firstMessage.id);
  assert.equal(buyerFirst.messageId, firstMessage.id);

  buyerSocket.close();
  await delay(500);
  const secondMessage = await sendMessage(
    args.baseUrl,
    seeded.sellerCookie,
    seeded.conversationId,
    `Realtime probe replay message ${probeId}`,
  );
  const sellerSecond = await sellerEvents.waitFor(secondMessage.id);
  const buyerReplaySocket = await connectSocket("buyer-replay", args.peerUrl, seeded.buyerCookie);
  sockets.push(buyerReplaySocket);
  const buyerReplayAck = await emitWithAck(buyerReplaySocket, "conversation.subscribe", {
    conversationId: seeded.conversationId,
    cursor: cursorFrom(sellerFirst),
  });
  assert.equal(buyerReplayAck.ok, true, JSON.stringify(buyerReplayAck));
  assert.ok(
    buyerReplayAck.events?.some((event) => event.messageId === secondMessage.id),
    "replay must include the missed message after reconnect",
  );

  const intruderSocket = await connectSocket("intruder", args.baseUrl, seeded.intruderCookie);
  sockets.push(intruderSocket);
  const intruderAck = await emitWithAck(intruderSocket, "conversation.subscribe", {
    conversationId: seeded.conversationId,
  });
  assert.equal(intruderAck.error?.code, "FORBIDDEN", JSON.stringify(intruderAck));

  const runtimes = [sellerAck.meta, buyerAck.meta, buyerReplayAck.meta].map(runtimeKey);
  const distinctRuntime = new Set(runtimes).size > 1;
  if (args.requireDistinctRuntime)
    assert.ok(distinctRuntime, `expected distinct runtime metadata, got ${runtimes.join(", ")}`);

  console.log(JSON.stringify({
    status: "ok",
    baseUrl: args.baseUrl,
    peerUrl: args.peerUrl,
    checkedAt: new Date().toISOString(),
    distinctRuntime,
    runtimes,
    checks: [
      "authenticated websocket handshake",
      "authorized room subscription",
      "message.created live fanout",
      "presence heartbeat",
      "reconnect cursor replay",
      "unauthorized subscription rejection",
    ],
    events: {
      firstEventId: sellerFirst.eventId,
      secondEventId: sellerSecond.eventId,
    },
  }, null, 2));
} finally {
  for (const socket of sockets) socket.close();
  if (mongoose.connection.readyState) {
    await cleanup().catch((error) => {
      console.error(`Synthetic realtime probe cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    await mongoose.disconnect();
  }
}
