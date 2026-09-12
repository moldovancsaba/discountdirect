import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export type EmailTransportConfig = {
  enabled: true;
  provider: "resend";
  apiKey: string;
  from: string;
  replyDomain: string;
  webhookSecret: string;
  unsubscribeSecret: string;
  publicBaseUrl: string;
  stagedRecipients: Set<string> | null;
};

export type EmailTransportReadiness =
  | EmailTransportConfig
  | { enabled: false; provider: "resend" | null; reasonCode: string };

export type ResendVerifiedEvent = {
  providerEventId: string;
  timestamp: number;
  payload: {
    type?: unknown;
    created_at?: unknown;
    data?: Record<string, unknown>;
  };
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function publicBaseUrl(env: Env) {
  const configured = clean(env.EMAIL_PUBLIC_BASE_URL) || clean(env.APP_URL);
  if (configured) return configured.replace(/\/+$/, "");
  const vercelUrl = clean(env.VERCEL_PROJECT_PRODUCTION_URL) || clean(env.VERCEL_URL);
  if (!vercelUrl) return "";
  return `${vercelUrl.startsWith("http") ? "" : "https://"}${vercelUrl}`.replace(/\/+$/, "");
}

export function normalizeRecipient(value: string) {
  return value.trim().toLowerCase();
}

export function emailTransportReadiness(env: Env = process.env): EmailTransportReadiness {
  const provider = clean(env.EMAIL_DELIVERY_PROVIDER).toLowerCase();
  if (!provider) return { enabled: false, provider: null, reasonCode: "TRANSPORT_NOT_CONFIGURED" };
  if (provider !== "resend") return { enabled: false, provider: null, reasonCode: "EMAIL_TRANSPORT_UNSUPPORTED_PROVIDER" };
  const apiKey = clean(env.RESEND_API_KEY);
  const from = clean(env.RESEND_FROM);
  const replyDomain = clean(env.RESEND_REPLY_DOMAIN).toLowerCase();
  const webhookSecret = clean(env.RESEND_WEBHOOK_SECRET);
  const unsubscribeSecret = clean(env.EMAIL_UNSUBSCRIBE_SECRET) || webhookSecret;
  const baseUrl = publicBaseUrl(env);
  if (!apiKey || !from || !replyDomain || !webhookSecret || !unsubscribeSecret || !baseUrl) {
    return { enabled: false, provider: "resend", reasonCode: "EMAIL_TRANSPORT_CONFIGURATION_INCOMPLETE" };
  }
  const stagedValues = clean(env.EMAIL_STAGED_RECIPIENTS)
    .split(",")
    .map((item) => normalizeRecipient(item))
    .filter(Boolean);
  return {
    enabled: true,
    provider: "resend",
    apiKey,
    from,
    replyDomain,
    webhookSecret,
    unsubscribeSecret,
    publicBaseUrl: baseUrl,
    stagedRecipients: stagedValues.length ? new Set(stagedValues) : null,
  };
}

export function configuredUnsubscribeSecret(env: Env = process.env) {
  return clean(env.EMAIL_UNSUBSCRIBE_SECRET) || clean(env.RESEND_WEBHOOK_SECRET);
}

export function recipientAllowedByStage(config: EmailTransportConfig, recipient: string) {
  return !config.stagedRecipients || config.stagedRecipients.has(normalizeRecipient(recipient));
}

export function replyAddress(deliveryId: string, replyDomain: string) {
  return `reply+${deliveryId}@${replyDomain}`;
}

export function unsubscribeToken(deliveryId: string, secret: string) {
  return createHmac("sha256", secret).update(deliveryId).digest("base64url");
}

export function verifyUnsubscribeToken(deliveryId: string, token: string, secret: string) {
  if (!deliveryId || !token) return false;
  const expected = unsubscribeToken(deliveryId, secret);
  const actual = Buffer.from(token);
  const safeExpected = Buffer.from(expected);
  return actual.length === safeExpected.length && timingSafeEqual(actual, safeExpected);
}

export function unsubscribeUrl(deliveryId: string, config: EmailTransportConfig) {
  const url = new URL("/api/email/unsubscribe", config.publicBaseUrl);
  url.searchParams.set("deliveryId", deliveryId);
  url.searchParams.set("token", unsubscribeToken(deliveryId, config.unsubscribeSecret));
  return url.toString();
}

function header(headers: Headers | Record<string, string | undefined>, name: string) {
  if (headers instanceof Headers) return headers.get(name) ?? "";
  return headers[name] ?? headers[name.toLowerCase()] ?? "";
}

function svixSecret(secret: string) {
  if (secret.startsWith("whsec_")) return Buffer.from(secret.slice("whsec_".length), "base64");
  return Buffer.from(secret);
}

function signatureValues(signature: string) {
  return signature
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const [version, value] = part.split(",", 2);
      return version === "v1" && value ? [value] : [];
    });
}

export function verifyResendWebhook(payload: string, headers: Headers | Record<string, string | undefined>, secret: string, nowMs = Date.now()): ResendVerifiedEvent {
  const id = header(headers, "svix-id");
  const timestampValue = header(headers, "svix-timestamp");
  const signature = header(headers, "svix-signature");
  const timestamp = Number(timestampValue);
  if (!id || !Number.isFinite(timestamp) || !signature) throw new Error("INVALID_WEBHOOK_SIGNATURE");
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > 300) throw new Error("STALE_WEBHOOK_SIGNATURE");
  const signedPayload = `${id}.${timestamp}.${payload}`;
  const expected = createHmac("sha256", svixSecret(secret)).update(signedPayload).digest();
  const matches = signatureValues(signature).some((value) => {
    const actual = Buffer.from(value, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  if (!matches) throw new Error("INVALID_WEBHOOK_SIGNATURE");
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("INVALID_WEBHOOK_PAYLOAD");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("INVALID_WEBHOOK_PAYLOAD");
  return { providerEventId: id, timestamp, payload: parsed as ResendVerifiedEvent["payload"] };
}

export function payloadHash(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

export async function sendResendEmail(
  config: EmailTransportConfig,
  input: {
    deliveryId: string;
    sellerId: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    idempotencyKey: string;
  },
  fetcher: FetchLike = fetch,
) {
  const url = unsubscribeUrl(input.deliveryId, config);
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      reply_to: replyAddress(input.deliveryId, config.replyDomain),
      headers: {
        "X-DiscountDirect-Delivery-Id": input.deliveryId,
        "List-Unsubscribe": `<${url}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [
        { name: "delivery_id", value: input.deliveryId },
        { name: "seller_id", value: input.sellerId },
      ],
    }),
  });
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!response.ok) {
    const code = typeof body?.name === "string" ? body.name : `RESEND_${response.status}`;
    throw new Error(code);
  }
  const id = typeof body?.id === "string" ? body.id : typeof body?.data?.id === "string" ? body.data.id : null;
  if (!id) throw new Error("RESEND_RESPONSE_MISSING_ID");
  return { id };
}

export async function getResendReceivedEmail(config: EmailTransportConfig, emailId: string, fetcher: FetchLike = fetch) {
  const response = await fetcher(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (!response.ok) throw new Error(typeof body?.name === "string" ? body.name : `RESEND_RECEIVING_${response.status}`);
  return body?.data && typeof body.data === "object" ? body.data as Record<string, unknown> : body as Record<string, unknown>;
}

export function deliveryIdFromAddresses(values: unknown, replyDomain: string) {
  const list = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const escapedDomain = replyDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`reply\\+([a-f0-9]{24})@${escapedDomain}`, "i");
  for (const value of list) {
    if (typeof value !== "string") continue;
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function inboundMessageBody(email: Record<string, unknown>) {
  const text = typeof email.text === "string" ? email.text : "";
  const html = typeof email.html === "string" ? email.html : "";
  const stripped = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  return (text || stripped).replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim().slice(0, 2000);
}
