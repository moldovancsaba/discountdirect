# Email delivery provider evidence - 2026-09-12

## Decision

Decision: select Resend as the first approved e-mail adapter path, but keep production sending disabled until sender-domain DNS, webhook configuration and staged-recipient controls are installed in the connected Vercel project.

Current production state: production e-mail delivery is enabled for the staged recipient only. On 2026-09-14, `EMAIL_PUBLIC_BASE_URL`, `EMAIL_UNSUBSCRIBE_SECRET`, `RESEND_FROM`, `RESEND_REPLY_DOMAIN`, `EMAIL_STAGED_RECIPIENTS`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `EMAIL_DELIVERY_PROVIDER=resend` were configured in the connected Vercel Production environment, using `direct.haho.ai` as the Resend sender/reply subdomain and `DiscountDirect <offers@direct.haho.ai>` as the sender identity. The staged recipient value and provider secrets remain in Vercel only.

DNS/provider check on 2026-09-14: the Resend API reported `direct.haho.ai` as `verified` in region `eu-west-1`, with domain capabilities `sending=enabled` and `receiving=disabled`. Public DNS shows the Resend sending DKIM/SPF records, but no inbound `MX` record for `direct.haho.ai` and no DMARC record at `_dmarc.direct.haho.ai`.

Therefore issue #20 is not closable yet: the first live staged outbound message has been accepted by Resend, but a live inbound reply, bounce/complaint callback and final production evidence note still need to be completed before closure. The first staged-recipient reply attempt did not create a `DeliveryWebhookEvent` or buyer `ConversationEvent` because receiving is still disabled for the domain.

Source commits:

- `b639d6e` (`feat: add provider-gated email delivery`).
- `e431fa2` (`docs: record email delivery preview evidence`).
- `531bb96` (`test: add email delivery integration probe`).
- `b97ffb0` (`chore: ignore macos metadata files`) was the current main commit when the first safe Vercel production mailing variables were added on 2026-09-14.
- `7ac724f` (`docs: record staged email recipient setup`) was the current main commit when the staged production send was accepted by Resend on 2026-09-14.

Latest Preview deployment: `dpl_6qPvP2Hg94tWm9FWGPuEFChYy25p`, Ready at `https://discountdirect-imdh7tygm-narimato.vercel.app`, target `preview`.

Preview limitation: the app URL serves Vercel Preview protection to unauthenticated route checks and no local bypass secret is configured, so `pnpm test:quality-release` cannot verify page HTML against the preview. Vercel build/route collection succeeded and app-level behavior was verified locally/integration against the same source state.

Verification run:

- `pnpm check`: passed.
- `pnpm test:auth-integration`: passed against a temporary isolated Atlas database; no provider variables were set, so existing unsupported outbox behavior remained honest.
- `pnpm test:email-integration`: passed against a disposable Atlas database and local fake Resend endpoint; it verifies cron send, provider acceptance, signed inbound reply, duplicate rejection, forged webhook rejection, bounce suppression, future-send suppression and signed unsubscribe without contacting real recipients.
- `pnpm db:indexes`: passed; new delivery suppression and webhook-event indexes are present.
- `pnpm db:restore-drill`: passed using disposable `dd_restore_d48f146aff`; synthetic probe data was removed.
- `git diff --check`: passed.
- `SMOKE_BASE_URL=https://discountdirect-kikhp5net-narimato.vercel.app pnpm test:quality-release`: blocked by Vercel Preview protection before app HTML was returned.
- `pnpm ops:monitor`: passed after the Resend provider values were configured.
- `pnpm test:quality-release`: passed against `https://discountdirect.vercel.app` after the Resend provider values were configured.
- Live staged production delivery `6aa7d0ed8a6ea3358ab58e04`: production cron processed one queued delivery, Resend accepted the send with provider message ID `35e0305a-57ef-4743-b411-c87798b6a9a1`, and the outbox row moved to `sent` with `RESEND_ACCEPTED` at `2026-09-14T10:48:15.242Z`.
- Inbound check after the staged recipient replied: no `email.received` webhook row and no buyer conversation message were present. Resend domain details showed receiving disabled, and `/events` returned no recent provider event sample.

## Provider fit

Official Resend documentation reviewed:

- Verified domains are required before sending from owned domains, and Resend supports sending/receiving on verified domains: [Verified Domains](https://resend.com/docs/dashboard/domains/introduction).
- Resend exposes DKIM/SPF records and DMARC guidance for authenticated mail posture: [Managing Domains](https://resend.com/docs/dashboard/domains/manage-domains), [Implementing DMARC](https://resend.com/docs/dashboard/domains/dmarc).
- The Sending API supports idempotency keys and custom headers: [Send Email](https://resend.com/docs/api-reference/emails/send-email), [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
- Signed webhooks use Svix headers and must verify the raw request body: [Verify Webhooks Requests](https://resend.com/docs/webhooks/verify-webhooks-requests).
- Receiving supports `email.received` webhooks and a follow-up Receiving API call for body/header content: [Receiving Emails](https://resend.com/docs/dashboard/receiving/introduction), [Create a receiving Webhook](https://resend.com/docs/dashboard/receiving/create-receiving-webhook), [Get Email Content](https://resend.com/docs/dashboard/receiving/get-email-content).
- Pricing/features reviewed for current plan sizing, inbound support, DKIM/SPF/DMARC authentication, bounce details and signed webhook endpoints: [Pricing](https://resend.com/pricing).

## Implemented guardrails

- `EMAIL_DELIVERY_PROVIDER=resend` is required before new e-mail outbox rows move to `queued`; otherwise they remain `unsupported`.
- `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_DOMAIN`, `RESEND_WEBHOOK_SECRET` and a public base URL are required before sending.
- `EMAIL_STAGED_RECIPIENTS` can restrict delivery to approved test recipients during warmup.
- The delivery cron endpoint is `/api/cron/deliveries` and requires `Authorization: Bearer $CRON_SECRET`.
- The worker re-checks marketing consent and seller/global suppressions immediately before send.
- Resend sends use the delivery row's idempotency key, a `reply+{deliveryId}@{RESEND_REPLY_DOMAIN}` address, a `List-Unsubscribe` header and a signed unsubscribe URL.
- `/api/email/inbound` verifies the Svix signature and five-minute timestamp window before processing.
- Webhook events are deduplicated by provider event ID and persist only safe metadata plus a payload hash.
- `email.bounced`, `email.complained` and `email.suppressed` events update the outbox and create future-send suppressions.
- `email.received` routes a verified reply to the existing seller/buyer conversation and rejects attachments.
- `/api/email/unsubscribe` records seller-scoped suppression from a signed delivery token and continues to work if outbound sending is disabled but the unsubscribe secret remains configured.

## Required Vercel variables

Set values only in approved secret stores:

- `EMAIL_DELIVERY_PROVIDER=resend` (Production configured 2026-09-14)
- `EMAIL_PUBLIC_BASE_URL=https://discountdirect.vercel.app` (Production configured 2026-09-14)
- `EMAIL_STAGED_RECIPIENTS` (Production configured 2026-09-14; value kept in Vercel only)
- `EMAIL_UNSUBSCRIBE_SECRET` (Production configured 2026-09-14)
- `RESEND_API_KEY` (Production configured 2026-09-14; value kept in Vercel only)
- `RESEND_FROM=DiscountDirect <offers@direct.haho.ai>` (Production configured 2026-09-14)
- `RESEND_REPLY_DOMAIN=direct.haho.ai` (Production configured 2026-09-14)
- `RESEND_WEBHOOK_SECRET` (Production configured 2026-09-14; value kept in Vercel only)

`RESEND_API_BASE_URL` is present only for isolated local verification against a fake Resend endpoint. Leave it unset in Preview and Production so the adapter uses Resend's official API.

`MONGODB_URI`, `MONGODB_DB`, `OPERATIONS_TOKEN` and `CRON_SECRET` remain required for database, operations and cron access.

## Activation checklist

1. Add and verify a sending subdomain in Resend, preferably a purpose-specific subdomain rather than the root domain.
2. Publish and verify Resend's DKIM/SPF DNS records and a DMARC record for the sending domain.
3. Configure receiving for the reply domain and route `reply+*` addresses to Resend.
4. Create a Resend webhook for `email.received`, bounce, complaint and suppression events pointing to `/api/email/inbound`.
5. Store the variables above in Vercel Preview first; keep `EMAIL_STAGED_RECIPIENTS` limited to synthetic recipients.
6. Run `pnpm check` and `pnpm test:email-integration` locally before deploying; the latter uses a disposable database and local fake Resend endpoint.
7. Deploy an exact-commit Preview, create a synthetic buyer with active consent, enqueue one personal offer, run the authorized delivery cron and verify a Resend-accepted provider message ID.
8. Enable receiving for `direct.haho.ai` in Resend, publish the receiving `MX` record shown by Resend, confirm receiving is verified, then send a controlled reply to `reply+{deliveryId}@{RESEND_REPLY_DOMAIN}` and verify one buyer `ConversationEvent` appears in the correct conversation.
9. Trigger Resend bounce/complaint test events or approved test recipients and verify future outbox rows become `suppressed`.
10. Repeat the same evidence in Production only after the owner approves sender reputation rollout and staged-recipient expansion.

## Rollback

Set `EMAIL_DELIVERY_PROVIDER` empty or remove `RESEND_API_KEY`, then redeploy. Queued rows will not be marked sent without provider acceptance; retryable rows stay visible. Keep `EMAIL_UNSUBSCRIBE_SECRET` or `RESEND_WEBHOOK_SECRET` available long enough for already-sent unsubscribe links to remain valid.
