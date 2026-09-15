# Authentication and account provisioning

## DoneIsBetter SSO

The primary sign-in path matches the deli.africa sibling integration. `/api/auth/login` creates a signed, ten-minute OAuth flow cookie and redirects to `sso.doneisbetter.com` using Authorization Code, PKCE S256, state, nonce and the `openid profile email offline_access` scopes. The SSO client must register both callback URLs:

- `https://discountdirect.vercel.app/auth/callback`
- `https://discountdirect.vercel.app/api/oauth/callback`

The callback exchanges the code on the server, loads `/api/oauth/userinfo`, then checks `/api/users/{userId}/apps/{clientId}/permissions`. Only an `approved` permission creates a local session. The stable SSO subject, role, permission status and last SSO login time are stored on the local user; an approved SSO `admin` or `operator` role maps to the operator identity path. Seller memberships and buyer relationships remain server-checked records and are never inferred from an unapproved SSO permission.

Required environment variables are `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_REDIRECT1_URI` and `SSO_REDIRECT2_URI`. `SSO_ORIGIN` defaults to `https://sso.doneisbetter.com`. Never expose the secret to client code, query strings, logs, issues or documentation.

DiscountDirect has no public registration and no local password login. User identity is created and refreshed by DoneIsBetter SSO. Operators manage DiscountDirect access by revoking sessions, disabling local users, and revoking seller or buyer relationships from `/admin`.

## Prepare indexes

Run this after setting `MONGODB_URI` and the target `MONGODB_DB`:

```sh
pnpm db:indexes
```

The command creates the declared authentication indexes without deleting unrelated indexes. Session expiry uses Atlas TTL indexes.

## Provision accounts

Create an operator shell record only when you need to attach local seller/buyer records before the person's first SSO login:

```sh
pnpm auth:provision -- --email person@example.com --name "Person Name" --role operator --created-by "operator name"
```

Create a seller and its first owner:

```sh
pnpm auth:provision -- --email owner@example.com --name "Owner Name" --role seller --seller-slug sample-shop --seller-name "Sample Shop" --created-by "operator name"
```

Attach a buyer to an existing seller:

```sh
pnpm auth:provision -- --email buyer@example.com --name "Buyer Name" --role buyer --seller-slug sample-shop --created-by "operator name"
```

The command prepares local seller/buyer relationships only. It does not create an activation link or DiscountDirect password. The SSO callback owns the final identity, role and login state.

## Recovery and revocation

Recovery is handled in DoneIsBetter SSO. Operators can revoke DiscountDirect access from `/admin`. The revocation controls require a written reason and record an `AuthAuditEvent`. User session revocation increments the user's `authVersion` and marks open sessions revoked. User disable also revokes unconsumed legacy activation/recovery tokens. Seller membership and buyer relationship revocation mark the relationship revoked, increment the affected user's `authVersion` and revoke open sessions.

## Security boundaries and limitations

- `/api/auth/session` and `/api/auth/activate` reject local password flows with `SSO_ONLY`.
- Session cookies are HttpOnly, SameSite Strict, Secure in Production and scoped to `/`.
- Seller and buyer pages query memberships/relationships server-side on every request.
- `OPERATIONS_TOKEN` remains only as a machine bearer token for readiness probes. It is not a human operator login path.
- Realtime clients re-check the Atlas-backed session on reconnect and conversation subscription; revocation takes effect on the next HTTP request or reconnect.

## Verification

After `pnpm build`, run `pnpm test:auth-integration`. It creates a randomly named `discountdirect_auth_verify_*` database, verifies SSO-only session behavior, audited revocation, logout and cross-tenant denial, and removes its temporary collections. It never writes to the configured production database name.
