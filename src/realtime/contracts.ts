export const REALTIME_EVENT_TYPES = ["message.created", "offer.updated", "presence.changed"] as const;
export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

export type RealtimeEventPayload = {
  eventId: string;
  conversationId: string;
  type: RealtimeEventType;
  version: number;
  occurredAt: string;
  messageId: string | null;
};

export type RealtimeError = { error: { code: string; message: string; requestId: string } };

export function conversationSubscription(value: unknown) {
  if (!value || typeof value !== "object" || typeof (value as { conversationId?: unknown }).conversationId !== "string") return null;
  const conversationId = (value as { conversationId: string }).conversationId;
  if (!/^[a-f\d]{24}$/i.test(conversationId)) return null;
  const cursor = (value as { cursor?: unknown }).cursor;
  if (cursor != null && (typeof cursor !== "string" || cursor.length > 256)) return null;
  return { conversationId, cursor: cursor ?? null };
}
