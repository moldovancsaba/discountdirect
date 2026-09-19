export const CONNECTOR_PROVIDERS = ["shoprenter", "unas"] as const;
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];
export type ConnectorHealth = "disconnected" | "testing" | "healthy" | "degraded" | "disabled" | "action_required";

export type CheckoutRequest = { handoffId: string; offerId: string; productSku: string; quantity: number; priceHuf: number; expiresAt: Date };
export type CheckoutResult = { url: string; providerReference: string };

export interface CommerceConnector {
  provider: ConnectorProvider;
  testConnection(signal: AbortSignal): Promise<void>;
  createCheckout(request: CheckoutRequest, signal: AbortSignal): Promise<CheckoutResult>;
}

export function connectorProvider(value: unknown): ConnectorProvider | null {
  return typeof value === "string" && CONNECTOR_PROVIDERS.includes(value as ConnectorProvider) ? value as ConnectorProvider : null;
}

export function safeCheckoutUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("INSECURE_CHECKOUT_URL");
  return url.toString();
}
