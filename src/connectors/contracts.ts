export const CONNECTOR_PROVIDERS = ["shoprenter", "unas"] as const;
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];
export type ConnectorHealth = "disconnected" | "testing" | "healthy" | "degraded" | "disabled" | "action_required";

export type CheckoutRequest = { handoffId: string; offerId: string; productSku: string; quantity: number; priceHuf: number; expiresAt: Date };
export type CheckoutResult = { url: string; providerReference: string };
export type ConnectorPage<T> = { items: T[]; nextCursor: string | null };
export type CanonicalProduct = { providerId: string; sku: string; name: string; priceHuf: number; active: boolean; updatedAt: Date | null };
export type CanonicalOrder = { providerId: string; status: string; totalHuf: number; createdAt: Date; updatedAt: Date | null; handoffId?: string | null; offerId?: string | null };
export type CanonicalStock = { providerId: string; sku: string; quantity: number; updatedAt: Date | null };
export type ConnectorConfiguration = { shopName?: string; shopUrl: string; checkoutUrlTemplate: string };

export interface CommerceConnector {
  provider: ConnectorProvider;
  testConnection(signal: AbortSignal): Promise<void>;
  listProducts(cursor: string | null, signal: AbortSignal): Promise<ConnectorPage<CanonicalProduct>>;
  listOrders(cursor: string | null, signal: AbortSignal): Promise<ConnectorPage<CanonicalOrder>>;
  getStock(skus: string[], signal: AbortSignal): Promise<CanonicalStock[]>;
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

export function connectorConfiguration(value: unknown): ConnectorConfiguration | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.shopUrl !== "string" || typeof source.checkoutUrlTemplate !== "string") return null;
  try {
    const shopUrl = safeCheckoutUrl(source.shopUrl);
    const template = source.checkoutUrlTemplate;
    const probe = safeCheckoutUrl(template.replaceAll("{sku}", "SKU").replaceAll("{handoffId}", "handoff"));
    if (!template.includes("{sku}") || new URL(shopUrl).origin !== new URL(probe).origin) return null;
    const shopName = typeof source.shopName === "string" && /^[a-z0-9-]{2,80}$/.test(source.shopName) ? source.shopName : undefined;
    return { shopName, shopUrl, checkoutUrlTemplate: template };
  } catch { return null; }
}
