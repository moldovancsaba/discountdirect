# Foundation architecture — 0.3.0

Next.js 16.3.4 App Router owns the frontend and HTTP backend, with React 19.2.8, TypeScript 6.0.3, Node 24 and Mongoose 9.9.5. The existing Vercel project is `narimato/discountdirect` and GitHub main is the release branch.

## Implemented routes

- `/`: Hungarian overview; upcoming product capabilities are explicitly labeled as planned.
- `/admin`: protected General Dashboard with an on-demand Atlas ping, response duration, release version, and an explicit unavailable/not-yet-instrumented user-presence state.
- `/api/health/live`: public process liveness; `{status,service,version}`; does not call Atlas.
- `/api/health/ready`: operator Bearer token required; returns 401 before any database access when unauthorized, 200 for a successful ping, 503 when the database cannot be reached. Responses are not cached. Presence is `{status:"not_instrumented",activeUsers:null}`, never an invented zero.

## Database connection

Only server code imports the shared Mongoose helper. The URI is read at request time, allowing clean builds without database credentials. Concurrent first requests share a pending connection. Failed connection attempts clear the pending promise, allowing subsequent requests to recover. Pool size is capped at five per function instance; selection/connect/socket and ping deadlines are bounded at five seconds. Automatic index creation and command buffering are disabled. This release does not create business collections, insert demo records or run migrations.

Use `MONGODB_DB` to select a database, default `discountdirect`. Each future tenant-scoped collection and index belongs to its domain issue. Atlas backup/access-policy acceptance remains in issue #2.

## Temporary operator access

`OPERATIONS_TOKEN` is a generated, high-entropy, server-only key, minimum 32 characters. Next.js Server Actions handle form origin validation. Token comparison uses fixed-size SHA-256 digests with constant-time comparison. A successful login sets a signed HttpOnly, SameSite=Strict cookie, Secure in production, expiring after one hour. The raw operator key is never stored in the cookie or sent in HTML. Rotating the environment key invalidates all existing sessions. Logout clears this browser's cookie; it does not revoke another copied cookie before expiry. Individual identities, revocable database sessions and role-based access are planned in #4; this operator gate is not buyer/seller authentication. There is no public registration.

## Identity access slice

Release 0.3.0 adds Atlas-backed users, sellers, memberships, buyer relationships, activation/recovery tokens, sessions and durable login rate limits. Passwords use versioned Node scrypt parameters and a random salt. Browser sessions store only a random opaque token; Atlas stores its SHA-256 hash. Sessions have a 30-minute idle deadline and a 12-hour absolute deadline. Activation and recovery rotate `authVersion` and revoke all existing sessions in one transaction.

`GET /api/me` resolves scopes on the server. Seller routes require an active membership for the exact seller slug. Buyer routes require an active relationship for the exact seller slug. Client-supplied roles and seller identifiers never grant access. Cookie-authenticated API mutations compare the request Origin with the effective Vercel host. Login attempts use an Atlas collection, so the five-attempt/15-minute limit applies across function instances.

The account UI supports sign-in, activation, scoped workspace selection and logout. There is no public signup or working email recovery claim. Manual provisioning and recovery are documented in [authentication.md](authentication.md). Administrator MFA and migration away from the emergency operations key remain release gates in issue #4.

## Interface decision

The user explicitly deferred GDS on 2026-09-08 after GitHub Packages denied package downloads with an organization billing-limit error. This release uses native HTML, local CSS and system fonts, with no replacement component library or external font service. Restore GDS through #3; no GDS compliance claim is made.

## Toolchain

Use pnpm 10.30.3 and the committed lockfile. TypeScript 6.0 and ESLint 9 match the current Next.js ESLint plugin peer ranges; ESLint 9 has an upstream deprecation notice. Track a compatible tooling update rather than forcing incompatible ESLint 10/TypeScript 7 peers. Install scripts are permitted only for `sharp` and `unrs-resolver`.

## Remaining product work

Public registration, administrator MFA, catalog/imports, purchase history, personalized offers, conversations, Socket.IO, presence tracking, campaigns, automations, delivery and redemption are not implemented. The existing issues #4–#20 specify those increments. No customer data has been seeded.
