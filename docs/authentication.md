# Authentication and account provisioning

## DoneIsBetter SSO

The primary sign-in path matches the deli.africa sibling integration. `/api/auth/login` creates a signed, ten-minute OAuth flow cookie and redirects to `sso.doneisbetter.com` using Authorization Code, PKCE S256, state, nonce and the `openid profile email offline_access` scopes. The SSO client must register both callback URLs:

- `https://discountdirect.vercel.app/auth/callback`
- `https://discountdirect.vercel.app/api/oauth/callback`

The callback exchanges the code on the server, loads `/api/oauth/userinfo`, then checks `/api/users/{userId}/apps/{clientId}/permissions`. Matching deli.africa, the returned permission state is synchronized with the local account and does not prevent local session creation. The stable SSO subject is stored on the local user; an approved SSO `admin` role maps to the operator identity path. Local operator assignment, seller memberships and buyer relationships remain server-checked records and are never inferred from an unapproved SSO permission.

Required environment variables are `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_REDIRECT1_URI` and `SSO_REDIRECT2_URI`. `SSO_ORIGIN` defaults to `https://sso.doneisbetter.com`. Never expose the secret to client code, query strings, logs, issues or documentation.

DiscountDirect has no public registration. An authorized operator provisions an account and hands the resulting one-time link to the intended person through an owner-approved channel. The link expires after one hour, is stored only as a hash and can be used once.

## Prepare indexes

Run this after setting `MONGODB_URI` and the target `MONGODB_DB`:

```sh
pnpm db:indexes
```

The command creates the declared authentication indexes without deleting unrelated indexes. Session, access-token and rate-limit expiry use Atlas TTL indexes.

## Provision accounts

Create an operator:

```sh
APP_URL=https://discountdirect.vercel.app pnpm auth:provision -- --email person@example.com --name "Person Name" --role operator --created-by "operator name"
```

Create a seller and its first owner:

```sh
APP_URL=https://discountdirect.vercel.app pnpm auth:provision -- --email owner@example.com --name "Owner Name" --role seller --seller-slug sample-shop --seller-name "Sample Shop" --created-by "operator name"
```

Attach a buyer to an existing seller:

```sh
APP_URL=https://discountdirect.vercel.app pnpm auth:provision -- --email buyer@example.com --name "Buyer Name" --role buyer --seller-slug sample-shop --created-by "operator name"
```

The command prints the one-time link once. Do not paste it into an issue, log, source file or group conversation. No password is accepted by the provisioning command. The recipient chooses a 12–128-character password on `/activate`; the password is stored as a versioned scrypt hash.

## Recovery and revocation

Until delivery issue #20 exists, recovery is a manual identity-verification procedure. After confirming the requester using the owner-approved offline process, create a recovery link:

```sh
APP_URL=https://discountdirect.vercel.app pnpm auth:provision -- --email person@example.com --name "Person Name" --role buyer --seller-slug sample-shop --purpose recovery --created-by "operator name"
```

Recovery refuses missing/inactive accounts, revokes any prior unconsumed recovery link and revokes current sessions. Successful activation/recovery increments the user's authorization version and revokes any remaining sessions again.

Operators can revoke access from `/admin`. The revocation controls require a written reason and record an `AuthAuditEvent`. User session revocation increments the user's `authVersion` and marks open sessions revoked. User disable also revokes unconsumed activation/recovery tokens. Seller membership and buyer relationship revocation mark the relationship revoked, increment the affected user's `authVersion` and revoke open sessions.

## Security boundaries and limitations

- Five failed attempts for the same hashed address/e-mail key block further attempts for 15 minutes across Vercel instances.
- Responses use the same invalid-credential message for unknown users and wrong passwords.
- Session cookies are HttpOnly, SameSite Strict, Secure in Production and scoped to `/`.
- Seller and buyer pages query memberships/relationships server-side on every request.
- Password recovery does not send email. The operator must never claim automatic delivery.
- The independent `OPERATIONS_TOKEN` remains as a break-glass operator path for database outage diagnosis and readiness probes. Day-to-day operator access should use a provisioned operator account or approved DoneIsBetter SSO admin. Because realtime remains disabled in production, revocation takes effect on the next HTTP request or reconnect; issue #10 owns the production WebSocket disconnect probe before realtime is enabled.

## Verification

After `pnpm build`, run `pnpm test:auth-integration`. It creates a randomly named `discountdirect_auth_verify_*` database, verifies login, audited revocation, logout, activation replay rejection, durable rate limiting and cross-tenant denial, and removes its temporary collections. It never writes to the configured production database name.
