# Release notes

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
