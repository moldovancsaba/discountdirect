# RCS delivery contract

The RCS capability is currently a provider-neutral contract foundation. It does
not claim that a carrier or Google RBM provider is enabled in production.

- Recipients are normalized to E.164 format.
- Rich messages have bounded fallback text, title, HTTPS deep links, and HTTPS
  image URLs.
- Callback signatures use HMAC-SHA256 over `timestamp.payload` and expire after
  five minutes.
- 408, 425, 429, and 5xx responses are retryable; other 4xx responses are
  terminal failures.

Live activation still requires a provider adapter, channel consent and cap
integration, outbox persistence, callback replay protection, provider sandbox
proof, and production credentials. Until then issue #45 remains blocked.
