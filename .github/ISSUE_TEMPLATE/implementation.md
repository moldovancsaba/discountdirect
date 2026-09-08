---
name: Implementation capability
about: Production capability following the ClassScout 26-section structure
title: '[Area]: '
---

## Source

Implementation plan derived from [DiscountDirect prototype v15](https://moldovancsaba.github.io/calvus/discountdirect/index.html), reviewed 2026-09-08. Issue structure follows [ClassScout #86](https://github.com/moldovancsaba/classscout/issues/86). Canonical plan: [IMPLEMENTATION_PLAN.md](https://github.com/moldovancsaba/discountdirect/blob/main/IMPLEMENTATION_PLAN.md).

## 1. Executive Summary

Describe the concrete capability and user-visible outcome.

## 2. Business / Product Context

DiscountDirect helps sellers turn their own customer purchase history into relevant offers and ongoing buyer conversations. This capability supports the [area] part of that journey.

## 3. Current State

Describe observed repository and production behavior with evidence.

## 4. Problem Statement

Describe the concrete capability and user-visible outcome. The current prototype does not provide the durable, authorized and observable behavior required for this capability in production.

## 5. Goals

### Functional Goals
List functional deliverables, technical constraints and user-facing behavior.

### Technical Goals
Centralize typed contracts, enforce authorization, persist authoritative state in Atlas and expose explicit recoverable errors. Keep release gates, environment assumptions and recovery evidence explicit.

### UX Goals
Make this capability reachable through the appropriate seller, buyer or administrator interface. Use clear Hungarian product language and GDS runtime states.

## 6. Non-Goals

List explicit scope boundaries.

## 7. Mandatory Technical Constraints

### Design System Requirement (Mandatory)
Use [General Design System](https://sovereignsquad.github.io/general-design-system/) packages and governed patterns exclusively for UI. GDS 6.7.0 is the documented current line at planning time; verify authenticated package availability and compatibility before installation. One provider, one stylesheet and one token authority. No parallel UI library or copied prototype visual primitives.

### Additional Constraints
Next.js frontend/backend; React and TypeScript/TSX; Node.js; MongoDB Atlas + Mongoose; Socket.IO; existing GitHub repository and [narimato/discountdirect on Vercel](https://vercel.com/narimato/discountdirect). GDS dependencies are allowed by the explicit UI requirement; do not independently use their vendor component APIs. No extra service, framework, local/demo persistence fallback, hardcoded credential or silent authorization bypass. Each implementation task must be tested, documented, committed, pushed and verified on an exact-commit Vercel Preview before closure. Production verification is required only when the change is intentionally release-enabled; #19 owns the complete production promotion and rollback.

## 8. Architecture

GDS interface -> authenticated Next.js boundary -> scoped domain service -> Mongoose/Atlas -> durable events/outbox -> Socket.IO and read models.

This issue owns the [area] capability described here. Shared contracts must remain compatible with dependent issues.

## 9. Data Model / Contracts

Define typed entities, indexes and request/response contracts.

Persist UTC timestamps and stable identifiers. Monetary values are integer HUF for MVP. Include seller scope in collections and indexes; add unique keys for operations described as idempotent.

## 10. API Contracts

Define typed entities, indexes and request/response contracts.

Validate at the server boundary. Return a typed success payload or `{error:{code,message,requestId}}`; use appropriate 400/401/403/404/409/429/503 states. Never trust client role, price or seller ownership. Cursor pagination is bounded.

## 11. Algorithm / Processing Logic

Define validation, state transitions, idempotency and processing order.

## 12. Mathematical / Ranking Logic

No ranking formula is introduced by this issue. Counts, prices, timestamps and any aggregation must use the canonical contracts and documented boundaries.

## 13. UX / Operator Behaviour

List functional deliverables, technical constraints and user-facing behavior.

Required applicable states: loading, empty, partial, disabled, saving/processing, success, validation error, system error, timeout, retry, permission denied and recovered. Confirm destructive product actions. Show delivery/reservation state honestly rather than claiming purchase, payment or dispatch without evidence.

## 14. Accessibility Requirements

Target WCAG 2.2 AA. Provide keyboard-complete workflows, labeled controls, semantic headings, visible focus, screen-reader announcements for async changes, GDS contrast, reduced motion and no color-only status. Preserve focus when updating chat and campaign results. Combine automated checks with manual keyboard, focus, screen-reader, 200% zoom/reflow and translated-content verification; automation alone is not conformance evidence.

## 15. Edge Cases

List meaningful unit, integration, concurrency, failure and browser scenarios.

## 16. Performance Expectations

Initial provisional budgets to verify with representative data: ordinary paginated reads p95 <=500ms, durable writes p95 <=700ms, cross-client updates p95 <=2s excluding reconnect. Batches and result limits must be bounded; imports/campaigns return durable progress instead of occupying unbounded requests. Record dataset size and environment with evidence; these are targets, not measured claims.

## 17. Security / Privacy Requirements

Enforce seller membership or buyer participation on each request and socket event. Keep Atlas/build/session secrets server-only. Redact message contents, buyer details and credentials from logs. Enforce current channel preferences; restrict exports and operator actions. Record audit metadata without duplicating sensitive payloads. Use synthetic data only in Production until #2's environment/network gate and #7's privacy/legal gate are approved.

## 18. Acceptance Criteria

### Functional
- [ ] Add measurable behavior-specific acceptance criteria.

### Technical
- [ ] Typed contracts and server validation cover the capability.
- [ ] Duplicate/retry/concurrent execution preserves documented invariants.
- [ ] No silent demo fallback or unhandled failure path.

### UX
- [ ] Applicable UI uses shipped GDS patterns and all required runtime states.
- [ ] Hungarian labels, HUF formatting and Budapest dates are verified.

### Accessibility
- [ ] Keyboard, labels, announcements, focus, contrast and zoom verified.

### Observability / Operations
- [ ] Failure reasons and bounded retry/recovery are visible to authorized operators.

### Documentation
- [ ] Relevant architecture, API, user and operational guidance updated.
- [ ] Exact-commit Preview verification and recovery evidence attached; Production evidence is attached when intentionally release-enabled.

## 19. Testing Requirements

List meaningful unit, integration, concurrency, failure and browser scenarios.

Establish and run repository commands `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run gds:compliance`, `npm run semantic:audit`, and `npm run i18n:audit`. These are planned acceptance commands, not existing or already-passed scripts. Add meaningful unit/integration coverage and browser evidence appropriate to the changed behavior. Use isolated fixtures; production smoke must not contact real customers.

## 20. Documentation Requirements

List documents to update. Describe configuration by variable name only, the supported flow, limitations, incident symptoms and exact recovery steps.

## 21. Dependencies

- No feature dependency; this is an initial foundation task.

## 22. Execution Order

0 in the DiscountDirect implementation lane. Initial board status: **Backlog (SOONER)**. Area: **[area]**. Phase and dependency sequencing are recorded in IMPLEMENTATION_PLAN.md.

## 23. Observability, Retries, Timeouts

Emit request/event/run ID, capability, duration, state and safe reason codes. Bound network calls and retry attempts; use durable outbox leases for background delivery. A retryable failure must be visible and recoverable. Do not log raw requests, secrets or buyer content.

## 24. Rollback / Recovery

Describe a concrete safe rollback/recovery procedure.

## 25. Handover

### What Changed
Deliver the scoped capability, contracts, UI, tests and documentation above.

### How to Run
After foundation setup: `npm ci` then `npm run dev`, using documented local development configuration and an isolated Atlas database.

### Configuration
Record new variable names in `.env.example`; store values only in approved local/Vercel/GitHub secret stores.

### How to Verify
Run section 19 checks and the scenario-specific acceptance tests; attach the commit and exact-commit Preview evidence. Attach Production evidence only when the change is intentionally release-enabled.

### Known Limitations
List explicit scope boundaries. Link any additional deferred behavior before closing.

### Rollback Plan
Describe a concrete safe rollback/recovery procedure.

## 26. Delivery Expectations

Do not close at code completion alone. Tests, GDS/accessibility checks, documentation, GitHub commit/push, exact-commit Vercel Preview verification and recovery evidence are required. Production promotion is gated and owned by #19. Release notes include New Features, Fixed Bugs, Known Issues and Future Roadmap.
