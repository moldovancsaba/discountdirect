# WhatsApp delivery contract

The WhatsApp capability is currently a provider-neutral contract foundation. It
does not claim that Meta delivery is enabled in production.

## Rules

- Recipients must be normalized to E.164 format.
- Outbound messages must use an approved template name and locale. Arbitrary
  free-form marketing text is not accepted by the adapter contract.
- Template variables are explicit, bounded, and limited to 20 values of at most
  500 characters each.
- Callback signatures use HMAC-SHA256 over `timestamp.payload` and are rejected
  when older than five minutes, malformed, or not constant-time equal.
- HTTP 408, 425, 429, and 5xx responses are retryable. Other 4xx responses are
  terminal provider failures.

## Runtime boundary

The adapter contract lives in `src/channels/whatsapp-core.ts`. It is deliberately
isolated from the current e-mail/postal outbox until channel consent, frequency
caps, delivery-event persistence, and a provider callback route are wired as one
transactional delivery change.

## Production activation checklist

1. Configure the Meta/WhatsApp Business provider credentials and callback secret
   in Vercel production.
2. Add WhatsApp to the delivery outbox channel enum and privacy preference model.
3. Enforce channel consent and the seller's frequency-cap policy before enqueue.
4. Persist provider message IDs and callback events with idempotency keys.
5. Add the authenticated callback route, replay protection, retry worker, and
   operator metrics.
6. Verify an approved-template send and a delivered/read/failed callback in the
   provider sandbox before enabling the channel for tenants.

Until these steps are complete, issue #44 remains blocked and no WhatsApp send
should be presented as available to users.
