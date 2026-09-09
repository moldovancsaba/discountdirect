# Release notes

## 1.1.0 — Realtime readiness

### New features

- Added a Socket.IO WebSocket-only endpoint with opaque-session handshake authentication and per-conversation authorization.
- Added replayable Atlas realtime events, versioned message notifications, cursor recovery and 90-second presence expiry.
- Added a durable HTTP replay endpoint and clear connected, reconnecting, disabled and degraded conversation states.

### Known issues

- `REALTIME_ENABLED` remains false until Vercel two-client, cross-instance, function-duration and deployment-replacement probes pass with synthetic accounts.
- The Vercel WebSocket platform feature remains beta; HTTP conversations are the authoritative recovery path.

## 1.0.0 — Durable conversations

### New features

- Added seller-scoped buyer conversations, a buyer inbox, a seller inbox and chronological activity timelines.
- Added retry-safe message writes keyed by sender and client request ID, with unread counts and ordered cursor pagination.
- Enforced active seller membership or buyer relationship for every conversation read and write; added isolated Atlas integration coverage.

### Known issues

- Delivery, attachments, notifications, synchronization and real-time transport remain in later board items.

## 0.9.0 — 2026-09-09

### New features

- Stored seller recommendation previews using versioned compatibility, 90-day replenishment and same-category rules.
- Fixed rule priority, stable product-ID tie-breaking and a 20-result bound.
- Human-readable Hungarian reasons backed by exact purchase IDs and product/version/price snapshots.
- Channel consent, active relationship and privacy-state gates before ranking.
- Input hashing so an unchanged repeated preview resolves to the same durable record.

### Fixed bugs

- Refunded and corrected purchases cannot become recommendation evidence.
- Inactive and zero-stock products are excluded before rule evaluation.
- Customers without active consent or an active relationship receive an explicit blocked preview instead of inferred recommendations.

### Known issues

- Recommendation previews do not create or deliver offers; those workflows remain in issues #9–#13.
- Declined-offer exclusions start when durable offers exist in issue #11.
- Issue #7 still requires controller-owner approval before real personal data or marketing.

### Future roadmap

Build persistent seller-buyer conversations in #9, then add Socket.IO delivery and recovery in #10.

## 0.8.0 — 2026-09-09

### New features

- Seller-specific e-mail and postal marketing preferences with an exact Hungarian notice version.
- Append-only consent evidence for opt-ins and withdrawals; repeated unchanged saves do not create false events.
- Buyer requests for access export, processing restriction and erasure with idempotent open-request handling.
- Seller workflow with explicit requested, processing, completed and retryable failed states.
- Seven-day authenticated JSON exports containing only the requesting buyer's data for the selected seller.
- Transactional marketing withdrawal on restriction and erasure; erasure anonymizes seller-side identity and preserves financial purchase evidence.

### Fixed bugs

- Made Next.js lint plugins explicit development dependencies so clean installs resolve the complete lint configuration.
- Added an indexed open-request key so concurrent duplicate privacy requests converge on one record.
- Prevented an initial unchecked marketing channel from creating a false withdrawal event.

### Known issues

- Real personal data and marketing remain blocked until the controller owner approves the assessment, Hungarian notice, retention rules and operating procedure in issue #7.
- Cancellation of already queued delivery work depends on the delivery and campaign implementations in issues #12–#14.
- Automated request deadlines, reminders and operator escalation are not yet implemented.

### Future roadmap

Finish the remaining issue #7 approval and queued-delivery gates, then implement deterministic recommendations in #8 and persistent conversations in #9.

## 0.7.0 — 2026-09-09

### New features

- SovereignSquad GDS 6.7.0 runtime, governance and accessibility packages from the official release bundle.
- One root `GdsProvider` using the native `resolveGdsThemePreset("mint")` Mint circuit theme and Hungarian locale.
- Governed discovery shell, navigation, page headers, authentication shells, panels, cards, notices, status indicators, icons, controls, tables and error states on every implemented route.
- Light/dark theme control in the application shell.
- Strict `gds-adoption.json` compliance and GDS ESLint rules in the local and CI quality gates.

### Fixed bugs

- Removed the temporary hardcoded visual palette, spacing, typography, radii and motion values.
- Removed direct Mantine and Tabler imports from application code.
- Replaced native table markup and hidden form controls with GDS tables and server-bound action values.

### Known issues

- GitHub Packages tarball delivery still reports the SovereignSquad organization billing-limit response. The official GDS 6.7.0 release bundle is the project’s documented supported fallback and remains pinned until registry delivery is restored.
- Full privacy export, retention and erasure execution remains in issue #7.
- Customer history remains bounded to the latest 100 rows while cursor pagination is open.

### Future roadmap

Complete buyer preferences and privacy operations in #7, then deterministic recommendations in #8 and the Socket.IO conversation flow in #9–#10.

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
