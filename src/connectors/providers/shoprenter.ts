import type { CanonicalOrder, CanonicalProduct, CanonicalStock, CheckoutRequest, CheckoutResult, CommerceConnector, ConnectorConfiguration, ConnectorPage } from "../contracts.ts";
import { safeCheckoutUrl } from "../contracts.ts";
import { ProviderError, providerRequest, type ProviderFetch } from "../transport.ts";

export type ShoprenterCredentials = { clientId: string; clientSecret: string };
type Json = Record<string, unknown>;

function validCredentials(value: ShoprenterCredentials) {
  return typeof value.clientId === "string" && value.clientId.length >= 8 && typeof value.clientSecret === "string" && value.clientSecret.length >= 16;
}
const finite = (value: unknown) => { const parsed = Number(value); if (!Number.isFinite(parsed)) throw new ProviderError("INVALID_RESPONSE", false); return parsed; };
const date = (value: unknown) => typeof value === "string" && !value.startsWith("0000-") && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;

export class ShoprenterConnector implements CommerceConnector {
  readonly provider = "shoprenter" as const;
  private readonly credentials: ShoprenterCredentials; private readonly configuration: ConnectorConfiguration; private readonly fetcher: ProviderFetch;
  constructor(credentials: ShoprenterCredentials, configuration: ConnectorConfiguration, fetcher: ProviderFetch = fetch) {
    this.credentials=credentials; this.configuration=configuration; this.fetcher=fetcher;
    if (!validCredentials(credentials) || !configuration.shopName) throw new ProviderError("CONFIGURATION", false);
  }

  private async token(signal: AbortSignal) {
    const response = await providerRequest(this.fetcher, `https://oauth.app.shoprenter.net/${this.configuration.shopName}/app/token`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", client_id: this.credentials.clientId, client_secret: this.credentials.clientSecret }) }, signal);
    if (!response.ok) throw new ProviderError("AUTH", false);
    const body = await response.json() as Json;
    if (typeof body.access_token !== "string" || body.access_token.length < 16) throw new ProviderError("INVALID_RESPONSE", false);
    return body.access_token;
  }

  private async get(path: string, signal: AbortSignal) {
    const token = await this.token(signal);
    const response = await providerRequest(this.fetcher, `https://${this.configuration.shopName}.api2.myshoprenter.hu/api/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" } }, signal);
    if (!response.ok) throw new ProviderError("INVALID_RESPONSE", false);
    return await response.json() as Json;
  }

  async testConnection(signal: AbortSignal) { await this.get("products?full=1&page=0&limit=1", signal); }

  async listProducts(cursor: string | null, signal: AbortSignal): Promise<ConnectorPage<CanonicalProduct>> {
    const page = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
    const body = await this.get(`products?full=1&page=${page}&limit=50`, signal);
    const items = Array.isArray(body.items) ? body.items as Json[] : [];
    return { items: items.map((item) => ({ providerId: String(item.id ?? ""), sku: String(item.sku ?? ""), name: String(item.name ?? item.sku ?? ""), priceHuf: Math.round(finite(item.price)), active: String(item.status) === "1" && String(item.orderable) === "1", updatedAt: date(item.dateUpdated) })), nextCursor: body.next ? String(page + 1) : null };
  }

  async listOrders(cursor: string | null, signal: AbortSignal): Promise<ConnectorPage<CanonicalOrder>> {
    const page = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
    const body = await this.get(`orders?full=1&page=${page}&limit=50`, signal);
    const items = Array.isArray(body.items) ? body.items as Json[] : [];
    return { items: items.map((item) => ({ providerId: String(item.id ?? item.innerId ?? ""), status: String(item.orderStatus ?? item.status ?? "unknown"), totalHuf: Math.round(finite(item.total ?? item.totalPrice ?? 0)), createdAt: date(item.dateCreated) ?? new Date(0), updatedAt: date(item.dateUpdated) })), nextCursor: body.next ? String(page + 1) : null };
  }

  async getStock(skus: string[], signal: AbortSignal): Promise<CanonicalStock[]> {
    if (!skus.length) return [];
    const body = await this.get(`products?full=1&page=0&limit=100&sku=${encodeURIComponent(skus.slice(0, 100).join(","))}`, signal);
    const items = Array.isArray(body.items) ? body.items as Json[] : [];
    return items.map((item) => ({ providerId: String(item.id ?? ""), sku: String(item.sku ?? ""), quantity: finite(item.quantity ?? item.stock1 ?? 0), updatedAt: date(item.dateUpdated) }));
  }

  async createCheckout(request: CheckoutRequest, _signal: AbortSignal): Promise<CheckoutResult> {
    void _signal;
    const raw = this.configuration.checkoutUrlTemplate.replaceAll("{sku}", encodeURIComponent(request.productSku)).replaceAll("{handoffId}", encodeURIComponent(request.handoffId));
    return { url: safeCheckoutUrl(raw), providerReference: `shoprenter:${request.handoffId}` };
  }
}
