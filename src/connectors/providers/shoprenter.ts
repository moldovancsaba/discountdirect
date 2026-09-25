import type {
  CanonicalOrder,
  CanonicalProduct,
  CanonicalStock,
  CheckoutRequest,
  CheckoutResult,
  CommerceConnector,
  ConnectorConfiguration,
  ConnectorPage,
  OrderWriteBackRequest,
} from "../contracts.ts";
import { safeCheckoutUrl } from "../contracts.ts";
import {
  ProviderError,
  providerRequest,
  type ProviderFetch,
} from "../transport.ts";

export const SHOPRENTER_REQUIRED_SCOPES = [
  "product.product:read",
  "order.order:read",
  "store.webhook:read",
  "store.webhook:write",
] as const;
export type ShoprenterCredentials = { clientId: string; clientSecret: string };
type Json = Record<string, unknown>;

function validCredentials(value: ShoprenterCredentials) {
  return (
    typeof value.clientId === "string" &&
    value.clientId.length >= 8 &&
    typeof value.clientSecret === "string" &&
    value.clientSecret.length >= 16
  );
}

function integer(value: unknown, maximum = 1_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum)
    throw new ProviderError("INVALID_RESPONSE", false);
  const rounded = Math.round(parsed);
  if (Math.abs(parsed - rounded) > 0.0001)
    throw new ProviderError("INVALID_RESPONSE", false);
  return rounded;
}

function timestamp(value: unknown) {
  return typeof value === "string" &&
    !value.startsWith("0000-") &&
    !Number.isNaN(Date.parse(value))
    ? new Date(value)
    : null;
}

function items(body: Json) {
  const value = body.items ?? body.products ?? body.orders;
  if (!Array.isArray(value)) throw new ProviderError("INVALID_RESPONSE", false);
  return value as Json[];
}

function hasNext(body: Json, page: number, count: number) {
  if (body.next) return true;
  const pagination = body.pagination as Json | undefined;
  const totalPages = Number(
    pagination?.totalPages ?? pagination?.lastPage ?? 0,
  );
  return Number.isInteger(totalPages) && totalPages > page + 1
    ? true
    : count === 50;
}

export class ShoprenterConnector implements CommerceConnector {
  readonly provider = "shoprenter" as const;
  private readonly credentials: ShoprenterCredentials;
  private readonly configuration: ConnectorConfiguration;
  private readonly fetcher: ProviderFetch;
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    credentials: ShoprenterCredentials,
    configuration: ConnectorConfiguration,
    fetcher: ProviderFetch = fetch,
  ) {
    this.credentials = credentials;
    this.configuration = configuration;
    this.fetcher = fetcher;
    if (!validCredentials(credentials) || !configuration.shopName)
      throw new ProviderError("CONFIGURATION", false);
  }

  private async token(signal: AbortSignal) {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 30_000)
      return this.accessToken.value;
    const response = await providerRequest(
      this.fetcher,
      `https://oauth.app.shoprenter.net/${this.configuration.shopName}/app/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
        }),
      },
      signal,
    );
    if (!response.ok) throw new ProviderError("AUTH", false);
    const body = (await response.json()) as Json;
    if (typeof body.access_token !== "string" || body.access_token.length < 16)
      throw new ProviderError("INVALID_RESPONSE", false);
    const lifetime = Number(body.expires_in);
    this.accessToken = {
      value: body.access_token,
      expiresAt:
        Date.now() +
        (Number.isFinite(lifetime)
          ? Math.max(60, Math.min(lifetime, 86_400))
          : 300) *
          1_000,
    };
    return this.accessToken.value;
  }

  private async get(path: string, signal: AbortSignal) {
    const token = await this.token(signal);
    const response = await providerRequest(
      this.fetcher,
      `https://${this.configuration.shopName}.api2.myshoprenter.hu/api/${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      signal,
    );
    if (!response.ok) throw new ProviderError("INVALID_RESPONSE", false);
    const body = await response.json().catch(() => {
      throw new ProviderError("INVALID_RESPONSE", false);
    });
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ProviderError("INVALID_RESPONSE", false);
    return body as Json;
  }

  async testConnection(signal: AbortSignal) {
    await this.get("products?full=1&page=0&limit=1", signal);
  }

  async listProducts(
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<ConnectorPage<CanonicalProduct>> {
    const page = cursor && /^\d{1,9}$/.test(cursor) ? Number(cursor) : 0;
    const body = await this.get(
      `products?full=1&page=${page}&limit=50`,
      signal,
    );
    const rows = items(body);
    const mapped = rows.map((item) => {
      const providerId = String(item.id ?? item.innerId ?? "").trim();
      const sku = String(item.sku ?? "").trim();
      if (!providerId || !sku)
        throw new ProviderError("INVALID_RESPONSE", false);
      return {
        providerId,
        sku,
        name: String(item.name ?? item.productName ?? sku).trim(),
        priceHuf: integer(item.price),
        active: String(item.status) === "1" && String(item.orderable) === "1",
        updatedAt: timestamp(item.dateUpdated),
      };
    });
    return {
      items: mapped,
      nextCursor: hasNext(body, page, rows.length) ? String(page + 1) : null,
    };
  }

  async listOrders(
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<ConnectorPage<CanonicalOrder>> {
    const page = cursor && /^\d{1,9}$/.test(cursor) ? Number(cursor) : 0;
    const body = await this.get(`orders?full=1&page=${page}&limit=50`, signal);
    const rows = items(body);
    const mapped = rows.map((item) => {
      const providerId = String(item.id ?? item.innerId ?? "").trim();
      const createdAt = timestamp(item.dateCreated ?? item.dateAdded);
      const currency = String(
        item.currency ?? item.currencyCode ?? "HUF",
      ).toUpperCase();
      if (!providerId || !createdAt || currency !== "HUF")
        throw new ProviderError("INVALID_RESPONSE", false);
      return {
        providerId,
        status: String(item.orderStatus ?? item.status ?? "unknown").slice(
          0,
          80,
        ),
        totalHuf: integer(
          item.totalGross ?? item.total ?? item.totalPrice ?? 0,
        ),
        createdAt,
        updatedAt: timestamp(item.dateUpdated),
      };
    });
    return {
      items: mapped,
      nextCursor: hasNext(body, page, rows.length) ? String(page + 1) : null,
    };
  }

  async writeOrderBack(
    request: OrderWriteBackRequest,
    signal: AbortSignal,
  ): Promise<{ providerOrderId: string; status: string }> {
    void request;
    void signal;
    throw new ProviderError("CAPABILITY_UNSUPPORTED", false);
  }

  async getStock(
    skus: string[],
    signal: AbortSignal,
  ): Promise<CanonicalStock[]> {
    if (!skus.length) return [];
    const wanted = new Set(skus.slice(0, 100));
    const body = await this.get("products?full=1&page=0&limit=100", signal);
    return items(body)
      .filter((item) => wanted.has(String(item.sku ?? "")))
      .map((item) => ({
        providerId: String(item.id ?? item.innerId ?? ""),
        sku: String(item.sku),
        quantity: integer(item.quantity ?? item.stock1 ?? 0, 1_000_000),
        updatedAt: timestamp(item.dateUpdated),
      }));
  }

  async createCheckout(
    request: CheckoutRequest,
    _signal: AbortSignal,
  ): Promise<CheckoutResult> {
    void _signal;
    const raw = this.configuration.checkoutUrlTemplate
      .replaceAll("{sku}", encodeURIComponent(request.productSku))
      .replaceAll("{handoffId}", encodeURIComponent(request.handoffId));
    return {
      url: safeCheckoutUrl(raw),
      providerReference: `shoprenter:${request.handoffId}`,
    };
  }
}
