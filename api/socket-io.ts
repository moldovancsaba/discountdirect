import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import { resolveSessionToken, USER_SESSION_COOKIE } from "../src/auth/session-core.ts";
import { conversationSubscription } from "../src/realtime/contracts.ts";
import { realtimeEnabled, realtimeConversationAccess, removePresence, replayRealtimeEvents, heartbeatPresence, watchRealtimeEvents } from "../src/realtime/service.ts";

const server = createServer();
const ioOptions = { path: "/api/socket-io", transports: ["websocket"], allowUpgrades: true } as ConstructorParameters<typeof Server>[1];
const io = new Server(server, ioOptions);
const instanceId = randomUUID();
const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local";
let watching = false;

function instanceMeta() {
  return {
    instanceId,
    deploymentId,
    region: process.env.VERCEL_REGION ?? "local",
  };
}

function cookieValue(header: string | undefined, name: string) {
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function failure(code: string, message: string) {
  return { error: { code, message, requestId: crypto.randomUUID() } };
}

async function beginFanout() {
  if (watching || !realtimeEnabled()) return;
  watching = true;
  try {
    const stream = await watchRealtimeEvents((event) => io.to(`conversation:${event.conversationId}`).emit(event.type, event));
    stream.on("error", () => { watching = false; io.emit("realtime.status", { state: "degraded" }); });
  } catch { watching = false; io.emit("realtime.status", { state: "degraded" }); }
}

io.use(async (socket, next) => {
  if (!realtimeEnabled()) return next(new Error("REALTIME_DISABLED"));
  const user = await resolveSessionToken(cookieValue(socket.request.headers.cookie, USER_SESSION_COOKIE));
  if (!user) return next(new Error("UNAUTHORIZED"));
  socket.data.user = user;
  next();
});

io.on("connection", (socket) => {
  void beginFanout();
  socket.emit("realtime.instance", instanceMeta());
  const subscriptions = new Set<string>();
  socket.on("conversation.subscribe", async (input: unknown, acknowledge: (result: unknown) => void) => {
    const requested = conversationSubscription(input);
    if (!requested) return acknowledge(failure("INVALID_REALTIME", "A beszélgetési előfizetés érvénytelen."));
    try {
      await realtimeConversationAccess(socket.data.user.id, requested.conversationId);
      const replay = await replayRealtimeEvents(socket.data.user.id, requested.conversationId, requested.cursor);
      socket.join(`conversation:${requested.conversationId}`);
      subscriptions.add(requested.conversationId);
      await heartbeatPresence(socket.data.user.id, requested.conversationId);
      acknowledge({ ok: true, ...replay, meta: instanceMeta() });
    } catch { acknowledge(failure("FORBIDDEN", "Ehhez a beszélgetéshez nincs hozzáférésed.")); }
  });
  socket.on("presence.heartbeat", async (input: unknown, acknowledge?: (result: unknown) => void) => {
    const requested = conversationSubscription(input);
    if (!requested || !subscriptions.has(requested.conversationId)) return acknowledge?.(failure("INVALID_REALTIME", "A jelenléti kérés érvénytelen."));
    try { await heartbeatPresence(socket.data.user.id, requested.conversationId); acknowledge?.({ ok: true }); }
    catch { acknowledge?.(failure("FORBIDDEN", "A jelenlét nem frissíthető.")); }
  });
  socket.on("disconnect", () => { for (const conversationId of subscriptions) void removePresence(socket.data.user.id, conversationId); });
});

export default server;
