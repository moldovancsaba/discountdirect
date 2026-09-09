# Release notes

## 0.6.0 — 2026-09-09

### New features

- Seller-scoped customer records and immutable purchase lines with unique order/line identities.
- Staged JSON purchase import for up to 200 rows, checksum replay safety and one-transaction application.
- Chronological seller ledger with spend totals, product snapshots, corrections, refunds and optimistic versions.
- Buyer self-service purchase history limited to the authenticated account's active seller relationship.
- Persisted active, restricted and erasure-requested customer privacy states.

### Fixed bugs

- Refunds and corrected rows no longer contribute to customer spend totals.
- Missing or discontinued product mappings retain their imported SKU and name as historical evidence.
- Matching email addresses at different sellers remain separate customer profiles.

### Known issues

- GDS remains deferred by explicit user instruction after the package billing-limit failure.
- Full privacy export, retention and erasure execution remains in issue #7; this release records the workflow state and preserves required financial evidence.
- Customer history is intentionally bounded to the 100 latest rows while cursor pagination remains open.

### Future roadmap

Complete buyer preferences and privacy operations in #7, then build deterministic, explainable recommendations in #8.

## 0.5.0 — 2026-09-09

### New features

- Seller-scoped product creation, editing, confirmed archival and active-product filtering.
- Integer HUF price, stock, SKU, category and compatibility validation with optimistic versions.
- Durable JSON import preview for up to 100 rows, including per-row create/update/unchanged/error results.
- Checksum-based import replay safety, stale-preview rejection and versioned product revision history.

### Fixed bugs

- Replaces the seller workspace placeholder with a persistent catalog workflow.
- Invalid product input now returns a validation error instead of an availability failure.
- SSO callback behavior now matches deli.africa: an absent or pending provider permission record is synchronized instead of incorrectly rejecting a valid local account session.

### Known issues

- GDS remains deferred by explicit user instruction after the package billing-limit failure.
- Product images, external commerce connectors and historical offer snapshots arrive in later issues.
- Issue #4’s remaining MFA, audit/revocation and realtime disconnect gates remain open.

### Future roadmap

Add purchase-history import and seller-buyer ledgers in #6, then privacy preferences and explainable recommendations.

## 0.4.0 — 2026-09-09

### New features

- DoneIsBetter OAuth/OIDC sign-in matching the deli.africa sibling implementation.
- Authorization Code flow with PKCE S256, state, nonce and a signed ten-minute flow cookie.
- Both registered callback paths, server-side token exchange, user-info sync and per-client permission checks.
- Approved SSO users synchronize to Atlas and receive the existing revocable DiscountDirect session; approved SSO administrators use the operator identity path.

### Fixed bugs

- The sign-in page now offers the shared DoneIsBetter identity instead of requiring every user to maintain a separate local password.
- Unsafe return destinations, modified flow cookies, expired flows and unapproved app permissions are rejected.

### Known issues

- GDS remains deferred by user instruction after the GitHub Packages billing-limit failure.
- The emergency operations key remains available during database outages until the remaining #4 controls are complete.
- Full production login verification requires an approved human SSO account; automated checks cover redirect construction, PKCE and flow-cookie integrity without storing credentials.

### Future roadmap

Complete MFA, audit/revocation controls and realtime disconnect handling in #4, then continue catalog, purchase history, preferences and recommendations.

## 0.3.0 — 2026-09-09

### New features

- Manual, one-time account activation and recovery tokens stored only as hashes.
- Versioned scrypt password hashing and opaque Atlas-backed sessions with idle and absolute expiry.
- Seller membership, buyer relationship and operator roles resolved on the server.
- Sign-in, activation, scoped account workspace, logout, `/api/me` and session APIs.
- Atlas-backed cross-instance login throttling and same-origin protection for cookie-authenticated writes.
- Isolated authentication integration verification covering tenant denial and cleanup.

### Fixed bugs

- Replaces demo-style role switching with explicit persisted authorization boundaries.
- Logout now revokes the stored session rather than only clearing a browser cookie.
- Invalid credentials do not disclose whether an account exists.

### Known issues

- GDS remains deferred by user instruction after the GitHub Packages billing-limit failure.
- Operator MFA, full audit/revocation controls and removal of the emergency operations key remain open in #4. Production users should not be provisioned until those gates and privacy review are complete.
- Recovery links require an owner-approved manual handoff until delivery issue #20 is implemented.
- Product data, messaging, offers and realtime session-disconnect notifications are not implemented.

### Future roadmap

Complete the remaining #3/#4 gates, then catalog, purchase history, privacy preferences and explainable recommendations (#5–#8).

## 0.2.0 — 2026-09-08

### New features

- Runnable Next.js/TypeScript application and Hungarian responsive overview.
- Protected General Dashboard with live MongoDB Atlas connection and ping duration.
- Temporary operator login, one-hour signed sessions, logout and fail-closed access.
- Public liveness and authenticated database readiness routes.
- Read-only Atlas check, automated quality checks, HTTP smoke checks and GitHub CI.

### Fixed bugs

- Replaces the repository-only baseline with an executable application.
- Prevents raw database errors and credentials from appearing in public health responses.

### Known issues

- GDS is deferred by user instruction after a GitHub Packages billing-limit failure. The temporary UI is native HTML/CSS and is not GDS-compliant.
- Active-user tracking and Socket.IO are not implemented; the dashboard explicitly reports that measurement is unavailable.
- Shared operator access is temporary. Individual administrator accounts, tenant authorization and fully revocable sessions remain in #4.
- The current Next.js ESLint plugin ecosystem requires ESLint 9, which has an upstream deprecation notice; migrate once its plugins support ESLint 10.
- Feature, GDS governance and complete accessibility acceptance remain open. This is a foundation release, not the complete commercial application.

### Future roadmap

Complete #1–#3 remaining foundation acceptance, then #4 authentication/tenant isolation, #5 catalog, #6 purchase history, #7 preferences and #8 explainable recommendations. Follow with conversations, Socket.IO, offers and campaigns. See [implementation plan](IMPLEMENTATION_PLAN.md).

### Verification

Lint, strict typecheck, session tests and optimized production build pass locally. Atlas read-only ping passes. Desktop/mobile and operator login/logout were inspected in the browser. Production commit/deployment verification is recorded on [issue #1](https://github.com/moldovancsaba/discountdirect/issues/1).
