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

To revoke access, set the user, membership or buyer relationship to `disabled`/`revoked` in an audited operator procedure and increment the user's `authVersion`; then revoke that user's open sessions. A purpose-built operator UI and audit record are still required by issue #4 before full production account rollout.

## Security boundaries and limitations

- Five failed attempts for the same hashed address/e-mail key block further attempts for 15 minutes across Vercel instances.
- Responses use the same invalid-credential message for unknown users and wrong passwords.
- Session cookies are HttpOnly, SameSite Strict, Secure in Production and scoped to `/`.
- Seller and buyer pages query memberships/relationships server-side on every request.
- Password recovery does not send email. The operator must never claim automatic delivery.
- Operator MFA, audit UI, session-disconnect notifications and the removal of the emergency shared operations key remain open gates. Do not provision production users until those gates and the privacy gate are approved.

## Verification

After `pnpm build`, run `pnpm test:auth-integration`. It creates a randomly named `discountdirect_auth_verify_*` database, verifies login, logout/revocation, activation replay rejection, durable rate limiting and cross-tenant denial, and removes its temporary collections. It never writes to the configured production database name.
