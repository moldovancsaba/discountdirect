import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type { CanonicalOrder, CanonicalProduct, CanonicalStock, CheckoutRequest, CheckoutResult, CommerceConnector, ConnectorConfiguration, ConnectorPage } from "../contracts.ts";
import { safeCheckoutUrl } from "../contracts.ts";
import { ProviderError, providerRequest, type ProviderFetch } from "../transport.ts";

export type UnasCredentials = { apiKey: string };
type Xml = Record<string, unknown>;
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true });
const builder = new XMLBuilder({ ignoreAttributes: false, format: false });
const list = (value: unknown): Xml[] => Array.isArray(value) ? value as Xml[] : value && typeof value === "object" ? [value as Xml] : [];
const finite = (value: unknown) => { const parsed = Number(value); if (!Number.isFinite(parsed)) throw new ProviderError("INVALID_RESPONSE", false); return parsed; };
const date = (value: unknown) => { if (typeof value !== "string") return null; const parsed = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value); return Number.isNaN(parsed) ? null : new Date(parsed); };

export class UnasConnector implements CommerceConnector {
  readonly provider = "unas" as const;
  private readonly credentials: UnasCredentials; private readonly configuration: ConnectorConfiguration; private readonly fetcher: ProviderFetch;
  constructor(credentials: UnasCredentials, configuration: ConnectorConfiguration, fetcher: ProviderFetch = fetch) {
    this.credentials=credentials; this.configuration=configuration; this.fetcher=fetcher;
    if (typeof credentials.apiKey !== "string" || credentials.apiKey.length < 8) throw new ProviderError("CONFIGURATION", false);
  }

  private async post(endpoint: string, params: Xml, signal: AbortSignal, authenticated = true): Promise<Xml> {
    const headers: Record<string, string> = { "Content-Type": "application/xml", Accept: "application/xml" };
    if (authenticated) headers.Authorization = `Bearer ${await this.token(signal)}`;
    const response = await providerRequest(this.fetcher, `https://api.unas.eu/shop/${endpoint}`, { method: "POST", headers, body: builder.build({ Params: params }) }, signal);
    const body = parser.parse(await response.text()) as Xml;
    if (!response.ok || body.Error) throw new ProviderError(response.status === 401 || response.status === 403 ? "AUTH" : "INVALID_RESPONSE", false);
    return body;
  }

  private async token(signal: AbortSignal) {
    const body = await this.post("login", { ApiKey: this.credentials.apiKey }, signal, false);
    const login = (body.Login ?? body) as Xml;
    if (typeof login.Token !== "string" || login.Token.length < 8) throw new ProviderError("AUTH", false);
    return login.Token;
  }

  async testConnection(signal: AbortSignal) { await this.post("getProduct", { LimitNum: 1, LimitStart: 0, ContentType: "minimal" }, signal); }

  async listProducts(cursor: string | null, signal: AbortSignal): Promise<ConnectorPage<CanonicalProduct>> {
    const start = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
    const body = await this.post("getProduct", { LimitNum: 100, LimitStart: start, ContentType: "normal" }, signal);
    const products = list((body.Products as Xml | undefined)?.Product);
    return { items: products.map((item) => ({ providerId: String(item.Id ?? ""), sku: String(item.Sku ?? ""), name: String(item.Name ?? item.Sku ?? ""), priceHuf: Math.round(finite(item.Price ?? item.PriceNet ?? 0)), active: String((item.Statuses as Xml | undefined)?.Status ?? item.StatusBase ?? "1") !== "0", updatedAt: date(item.LastModTime ?? item.Time) })), nextCursor: products.length === 100 ? String(start + 100) : null };
  }

  async listOrders(cursor: string | null, signal: AbortSignal): Promise<ConnectorPage<CanonicalOrder>> {
    const start = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
    const body = await this.post("getOrder", { LimitNum: 100, LimitStart: start }, signal);
    const orders = list((body.Orders as Xml | undefined)?.Order);
    return { items: orders.map((item) => ({ providerId: String(item.Key ?? item.Id ?? ""), status: String(item.Status ?? item.StatusName ?? "unknown"), totalHuf: Math.round(finite(item.SumPriceGross ?? item.Total ?? 0)), createdAt: date(item.Date ?? item.Time) ?? new Date(0), updatedAt: date(item.Modified ?? item.Time) })), nextCursor: orders.length === 100 ? String(start + 100) : null };
  }

  async getStock(skus: string[], signal: AbortSignal): Promise<CanonicalStock[]> {
    if (!skus.length) return [];
    const body = await this.post("getStock", { Sku: skus.slice(0, 100).join(",") }, signal);
    return list((body.Products as Xml | undefined)?.Product).map((item) => ({ providerId: String(item.Id ?? ""), sku: String(item.Sku ?? ""), quantity: list((item.Stocks as Xml | undefined)?.Stock).reduce((sum, stock) => sum + finite(stock.Qty ?? 0), 0), updatedAt: null }));
  }

  async createCheckout(request: CheckoutRequest, _signal: AbortSignal): Promise<CheckoutResult> {
    void _signal;
    const raw = this.configuration.checkoutUrlTemplate.replaceAll("{sku}", encodeURIComponent(request.productSku)).replaceAll("{handoffId}", encodeURIComponent(request.handoffId));
    return { url: safeCheckoutUrl(raw), providerReference: `unas:${request.handoffId}` };
  }
}
