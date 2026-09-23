import "server-only";
import type { CommerceConnector, ConnectorConfiguration, ConnectorProvider } from "./contracts.ts";
import { ShoprenterConnector, type ShoprenterCredentials } from "./providers/shoprenter.ts";
import { UnasConnector, type UnasCredentials } from "./providers/unas.ts";
import { ProviderError, type ProviderFetch } from "./transport.ts";

function credentials<T>(reference: string): T {
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(reference)) throw new ProviderError("CONFIGURATION", false);
  const raw = process.env[reference];
  if (!raw) throw new ProviderError("CONFIGURATION", false);
  try { return JSON.parse(raw) as T; } catch { throw new ProviderError("CONFIGURATION", false); }
}

export function connectorFor(provider: ConnectorProvider, credentialRef: string, configuration: ConnectorConfiguration, fetcher: ProviderFetch = fetch): CommerceConnector {
  return provider === "shoprenter"
    ? new ShoprenterConnector(credentials<ShoprenterCredentials>(credentialRef), configuration, fetcher)
    : new UnasConnector(credentials<UnasCredentials>(credentialRef), configuration, fetcher);
}
