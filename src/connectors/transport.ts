export class ProviderError extends Error {
  code:
    | "AUTH"
    | "RATE_LIMIT"
    | "TIMEOUT"
    | "INVALID_RESPONSE"
    | "UNAVAILABLE"
    | "CONFIGURATION"
    | "CAPABILITY_UNSUPPORTED";
  retryable: boolean;
  constructor(code: ProviderError["code"], retryable: boolean, message = code) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export type ProviderFetch = typeof fetch;
export const providerRetryDelay = (attempt: number, jitter = Math.random()) =>
  150 * 2 ** attempt + Math.floor(Math.max(0, Math.min(1, jitter)) * 100);

export async function providerRequest(
  fetcher: ProviderFetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
) {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal.aborted) throw new ProviderError("TIMEOUT", true);
    try {
      const response = await fetcher(url, { ...init, signal });
      if (response.status === 401 || response.status === 403)
        throw new ProviderError("AUTH", false);
      if (response.status === 429 || response.status >= 500) {
        last = new ProviderError(
          response.status === 429 ? "RATE_LIMIT" : "UNAVAILABLE",
          true,
        );
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, providerRetryDelay(attempt)),
          );
          continue;
        }
        throw last;
      }
      return response;
    } catch (error) {
      if (error instanceof ProviderError && !error.retryable) throw error;
      last = error;
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, providerRetryDelay(attempt)),
        );
        continue;
      }
    }
  }
  throw last instanceof ProviderError
    ? last
    : new ProviderError("UNAVAILABLE", true);
}
