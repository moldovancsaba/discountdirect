# DiscountDirect implementation plan

Planning release: 0.1.0 — 2026-09-08. This release documents and creates the implementation backlog; it does not claim the application or Atlas connection has been implemented.

## Product definition

DiscountDirect is a seller–buyer relationship and personalized-offer application. Sellers use their own customers' purchase histories to explain relevant recommendations, send individual offers, launch stock/time-limited campaigns and schedule individually composed offer lists. Buyers can converse, inspect the rationale and accept or decline. Each seller must see only its own customer relationships.

The initial user experience is Hungarian, with integer HUF prices and Europe/Budapest presentation. Persist UTC timestamps. The seller and buyer modes in the reference are separate authorized product experiences, not a production role-switching shortcut.

## Evidence reviewed

- [Live DiscountDirect v15 reference](https://moldovancsaba.github.io/calvus/discountdirect/index.html) and its full HTML/JavaScript source. Source blob at review: `c7938622a078a9bff7817e895fc1cf9b44ecde9f`.
- [Prototype GDS token map](https://github.com/moldovancsaba/calvus/blob/main/discountdirect/GDS-TOKEN-MAP.md), blob `ea7848881f1c45923493f14135b1ff7b5bbf2a68`.
- [Target repository](https://github.com/moldovancsaba/discountdirect): initially README-only with zero issues.
- [Project #44](https://github.com/users/moldovancsaba/projects/44): two views; the board has eight status columns reproduced below. ClassScout content must not be copied into DiscountDirect.
- [Sample issue #86](https://github.com/moldovancsaba/classscout/issues/86): Source plus 26 numbered sections, acceptance subsections, test requirements, dependencies, execution order and handover. All implementation issues follow this structure with DiscountDirect-specific contracts.
- [GDS live documentation](https://sovereignsquad.github.io/general-design-system/) and [installation guide](https://github.com/sovereignsquad/general-design-system/blob/main/INSTALLATION_GUIDE.md): current documented version 6.7.0; authenticated GitHub Packages consumption.
- [Vercel project](https://vercel.com/narimato/discountdirect): project `prj_CR4pyuYeYlbO0WcvW5qBoD9zq36A`, team `team_uBQB8dqirkYrzoBxS0YQ9MMs`; existing READY production deployment, Node 24.x, framework not yet set. This metadata does not establish a functioning application or Atlas connectivity.
- [Current Vercel WebSockets documentation](https://vercel.com/docs/functions/websockets): Socket.IO is supported with WebSocket-only transport; lifecycle and instance boundaries require explicit recovery.
- [Atlas/Vercel integration documentation](https://www.mongodb.com/docs/atlas/reference/partner-integrations/vercel/): use the native integration for the requested project attachment.

Source inspection is completed. Initial rendered seller screen was inspected; a browser interaction timeout prevented claiming a full interactive prototype test. Production implementation testing remains future work.

## Reference behavior inventory

| Surface | Observed behavior | Required production replacement | Issues |
|---|---|---|---|
| Seller conversations | Eight buyers, latest entry, pending-offer badges | Tenant-scoped, paginated inbox; pending offers distinguished from unread messages | #4 #9 |
| Conversation thread | Text bubbles, offer cards and non-chat timeline events | Durable ordered records; send/retry; channel event provenance | #9 #10 #13 |
| Context panel | Purchases at this seller; recommended products with reasons | Imported purchase ledger and explainable rules | #5 #6 #8 |
| Individual offer | Channel selection, discounted HUF amount, buyer accept/decline | Immutable snapshot, authenticated atomic state transition, expiry | #11 |
| Flash campaign | Select product, discount, 6/24/48 hours, 10/20/50 units, audience reasons and preview | Shared stock reservation, server expiry, idempotent audience fanout and actual delivery progress | #12 #13 |
| Offer-list automation | Multiple products; weekly, fortnightly or monthly; per-buyer preview; start and stop | Durable schedule, Budapest calendar semantics, run ledger and recovery | #14 |
| Buyer chat | Own conversation with seller; eight-person demo selector | Own authenticated inbox; no cross-buyer selector | #4 #9 #15 |
| Email view | Latest offer sample, inert CTA and preference footer | Canonical offer link and preference center; preview until transport exists | #7 #15 #20 |
| Mailing view | Printed letter, sample address, predictable coupon | Authorized print-ready letter and secure single-use redemption; postal dispatch remains an operational arrangement | #15 #16 |
| Newsletter view | Catalog filtered per buyer; sample frequency and prices | Actual campaign/run snapshot and working preferences | #14 #15 |
| General Dashboard | Absent | Protected DB/user connections, performance, failures, backlog and release visibility | #17 |

Dataset: one example seller (ElektroHome Kft.), eight example buyers, 49 purchase rows, 26 catalog products and one initial automation. These are fictional fixtures, not a migration source for production customer data.

### What the prototype does not implement

All state is in memory and resets on reload. Recommendations and relevance are handwritten. Campaign success messages are not delivery receipts. Time and quantity limits are labels, not enforced constraints. Accepting a flash offer sets a browser flag and does not prove payment. Email links and unsubscribe text are inert; postal coupons are predictable. There is no authentication, database, real socket, scheduler, import interface, audit trail or system dashboard.

The token map explicitly describes naming alignment with GDS 6.5.0, not GDS consumption. Production must adopt the actual packages, provider and components instead of carrying the prototype's CSS forward.

## Scope and delivery phases

1. **Foundation and integrations (#1–#3):** runnable Next.js, existing Vercel configuration, Atlas connectivity and real GDS bootstrap. Prove package access and deployment early.
2. **Access and evidence (#4–#8):** secure accounts/tenancy, editable catalog, purchase imports, preferences and deterministic recommendation rules.
3. **Conversation-to-offer loop (#9–#11):** durable messaging, Vercel Socket.IO, individual offers and buyer decisions.
4. **Campaigns and channel surfaces (#12–#16):** flash reservation, outbox, recurring runs, buyer views, print/coupon redemption.
5. **Operations and release (#17–#19):** General Dashboard, complete verification, documented production rollout.
6. **Later (#20):** actual email and inbound replies once an authorized delivery arrangement is selected. Postal distribution, payment processing, ecommerce connectors and AI scoring require separately scoped follow-ups; no extra service is silently introduced.

Dependencies in each issue control readiness, even if several items share a phase. The foundation trio starts in Todo; dependent work starts in Backlog; external email starts in Roadmap. No application issue is marked Done by this planning exercise.

## Stack and architecture

| Concern | Decision |
|---|---|
| Frontend and HTTP backend | Next.js App Router, React, strict TypeScript/TSX |
| Runtime | Vercel Node.js; existing project currently configured for 24.x; verify selected package compatibility |
| Database | MongoDB Atlas through the Vercel integration; Mongoose schemas and server-only access |
| Realtime | Socket.IO server/client, WebSocket-only transport on Vercel |
| UI | GDS packages and governance; no independently used competing UI library |
| Languages and configuration | TypeScript, TSX, JavaScript for tooling, JSON, Markdown and platform configuration; no unrelated backend language/framework |
| Background work | Vercel Cron calling authenticated bounded workers; MongoDB leases, run ledger and outbox |
| Versioning and delivery | Existing GitHub repository, checks, documented version and Vercel Production deployment per implementation task |

GDS's React/vendor dependencies are intrinsic to the explicitly requested design system; they do not authorize feature code to import raw Mantine/Tabler or add another design system. Install aligned authenticated GDS versions; its guide currently verifies Next.js 15/React 19. Choose a patched supported Next.js line and test compatibility rather than treating that documented baseline as permission to install an outdated patch.

### Request and event flow

GDS UI -> authenticated Next.js route -> scoped service -> Mongoose/Atlas transaction -> durable event/outbox -> Socket.IO update or channel dispatcher -> GDS state refresh.

A standalone Node Socket.IO endpoint may coexist in the same Vercel project as the Next.js app using the documented Vercel pattern. Prove route configuration in #10. Cross-instance communication needs MongoDB-backed coordination, not just in-memory rooms. Reconnect uses bounded exponential delay, room reauthorization and cursor replay from persisted events. The WebSockets feature is currently beta; production evidence must cover duration expiry and deployment rollover. No Redis or external socket hosting is introduced.

### Core entities and invariants

- Identity: User, Seller, Membership, BuyerRelationship and revocable Session.
- Evidence: Product and Purchase, uniquely keyed by seller+SKU and seller+order+line.
- Interaction: Conversation and Message, unique request keys and indexed cursor ordering.
- Commercial intent: Offer snapshot, Campaign, Reservation and single-use Coupon. Offer decision, reservation, redemption, payment and fulfillment are separate concepts.
- Delivery: Preference, Delivery outbox, Automation and unique scheduled Run.
- Operations: append-safe audit/event records and expiring Presence heartbeats.

Use seller scope in relevant indexes and every authorization query. Persist original product/name/price/reason snapshots on offers. The shared flash quantity cannot go negative; responding twice cannot consume inventory twice. Expiry is checked during the state transition, independent of when a background cleanup runs. Price is calculated on the server and rounded once to integer HUF. Client-provided prices and roles are never authoritative.

### Routes

Seller: /seller/conversations, /seller/products, /seller/customers, /seller/campaigns/flash, /seller/automations.
Buyer: /buyer/conversations, /buyer/offers/:id, /buyer/lists/:id, /buyer/letters/:id, /buyer/preferences.
Admin: /admin, /admin/deliveries, /admin/jobs.
System: liveness/readiness, authenticated API contracts in the individual issues and a protected cron dispatcher.

## Configuration and integration gates

Atlas: inspect existing integration before provisioning; attach to the exact project; separate preview and production database access; verify a synthetic deployed round trip; document region, network policy and backup/restore. Never broaden network access or purchase a cluster as an unstated setup shortcut.

Expected variable names: MONGODB_URI, MONGODB_DB_NAME, APP_URL, session configuration/secret if required by the finalized session design, CRON_SECRET and GITHUB_TOKEN for authenticated GDS build installation. Record exact names in .env.example during implementation, no values. Integration-provided naming must be mapped explicitly rather than assumed.

GDS: scoped registry in .npmrc using environment interpolation; package read access available at build time in Vercel Preview and Production. No token in source, logs or NEXT_PUBLIC variables. Verify package access across organizations rather than assuming GitHub Actions' default token can read private packages.

Actual email is a decision gate. Until an approved mechanism exists, email/newsletter surfaces are previews and outbox channel state is unsupported; the application must not claim sent. Printed letters may be rendered for an authorized operator; physical posting is not automated or certified by rendering a letter.

## Quality and operational definition of done

Every implementation issue has its own concrete acceptance criteria plus the sample's 26-section structure. Establish lint, typecheck, test, build, GDS compliance, semantic and i18n checks in the foundation work. Planned commands are not reported as existing or passed.

Verify ownership attacks, duplicate operations, competing final-stock claims, expiry, scheduler duplicates/DST, outbox recovery, socket reconnect/cross-instance delivery, Atlas outages and current consent. Verify keyboard/screen-reader behavior, phone/tablet/desktop layouts, zoom, print and Hungarian formatting. Use nonproduction fixtures and production-safe synthetic accounts; do not message real buyers as a test.

Before closing an implementation issue: document, commit/push, run required checks, deploy the reviewed commit to the existing Vercel Production project, verify critical paths, and attach deployment/rollback evidence. Release notes must cover New Features, Fixed Bugs, Known Issues and Future Roadmap.

## Backlog

| Order | Issue | Initial status | Depends on |
|---|---|---|---|
| 10 | [#1 Foundation: Next.js TypeScript application and delivery baseline](https://github.com/moldovancsaba/discountdirect/issues/1) | Todo (NEXT) | — |
| 20 | [#2 Data: Connect MongoDB Atlas to the existing Vercel project](https://github.com/moldovancsaba/discountdirect/issues/2) | Todo (NEXT) | #1 |
| 30 | [#3 UI: Adopt General Design System and responsive application shell](https://github.com/moldovancsaba/discountdirect/issues/3) | Todo (NEXT) | #1 |
| 40 | [#4 Access: Seller buyer and administrator authentication and tenant isolation](https://github.com/moldovancsaba/discountdirect/issues/4) | Backlog (SOONER) | #1, #2, #3 |
| 50 | [#5 Catalog: Seller products and validated import workflow](https://github.com/moldovancsaba/discountdirect/issues/5) | Backlog (SOONER) | #2, #3, #4 |
| 60 | [#6 Customers: Purchase history and seller-buyer relationship ledger](https://github.com/moldovancsaba/discountdirect/issues/6) | Backlog (SOONER) | #2, #4, #5 |
| 70 | [#7 Privacy: Channel preferences consent and data lifecycle](https://github.com/moldovancsaba/discountdirect/issues/7) | Backlog (SOONER) | #4, #6 |
| 80 | [#8 Recommendations: Explainable purchase-based targeting](https://github.com/moldovancsaba/discountdirect/issues/8) | Backlog (SOONER) | #5, #6, #7 |
| 90 | [#9 Messaging: Persistent conversations and channel timeline](https://github.com/moldovancsaba/discountdirect/issues/9) | Backlog (SOONER) | #3, #4, #6 |
| 100 | [#10 Realtime: Socket.IO on Vercel with MongoDB coordination](https://github.com/moldovancsaba/discountdirect/issues/10) | Backlog (SOONER) | #2, #4, #9 |
| 110 | [#11 Offers: Personalized offer lifecycle and buyer decisions](https://github.com/moldovancsaba/discountdirect/issues/11) | Backlog (SOONER) | #7, #8, #9, #10 |
| 120 | [#12 Campaigns: Flash offers with atomic stock and expiry](https://github.com/moldovancsaba/discountdirect/issues/12) | Backlog (SOONER) | #8, #11 |
| 130 | [#13 Delivery: Durable outbox and honest channel delivery states](https://github.com/moldovancsaba/discountdirect/issues/13) | Backlog (SOONER) | #7, #9, #11 |
| 140 | [#14 Automations: Recurring personalized offer lists and scheduler](https://github.com/moldovancsaba/discountdirect/issues/14) | Backlog (SOONER) | #8, #12, #13 |
| 150 | [#15 Buyer: Offer inbox email newsletter and printable letter views](https://github.com/moldovancsaba/discountdirect/issues/15) | Backlog (SOONER) | #3, #7, #11, #13, #14 |
| 160 | [#16 Redemption: Single-use coupon and reservation confirmation](https://github.com/moldovancsaba/discountdirect/issues/16) | Backlog (SOONER) | #11, #12, #15 |
| 170 | [#17 Operations: General Dashboard and production health visibility](https://github.com/moldovancsaba/discountdirect/issues/17) | Backlog (SOONER) | #2, #4, #10, #13, #14 |
| 180 | [#18 Quality: End-to-end security accessibility and recovery verification](https://github.com/moldovancsaba/discountdirect/issues/18) | Backlog (SOONER) | #5, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16, #17 |
| 190 | [#19 Release: Production rollout documentation and rollback](https://github.com/moldovancsaba/discountdirect/issues/19) | Backlog (SOONER) | #18 |
| 200 | [#20 Roadmap: Real email delivery and inbound reply integration](https://github.com/moldovancsaba/discountdirect/issues/20) | Roadmap (LATER) | #7, #13, #15 |

## Project board contract

Board: [**{discountdirect} - From IDEA to LIVE (#61)**](https://github.com/users/moldovancsaba/projects/61), verified under the [repository Projects tab](https://github.com/moldovancsaba/discountdirect/projects). Its views, fields and workflows were copied from #44. Eleven inherited draft copies were archived in #61; source ClassScout content was not changed. The active board contains exactly the 20 DiscountDirect issues.

Preserve this exact status order: **IDEABANK (SOMEDAY)**, **Roadmap (LATER)**, **Backlog (SOONER)**, **Todo (NEXT)**, **In Progress (NOW)**, **Review (ALMOST)**, **Done**, **Declined (NEVER)**.

The delivery board groups by Status. A second table view should expose title/status and repository fields; execution order and dependencies remain authoritative in issues even if optional numeric fields are unavailable. All current active items are from this repository. Auto-add is enabled for open DiscountDirect issues only. Merged pull requests move to Review (ALMOST), leaving production verification as a separate gate. Done requires production evidence; Declined records a reason and closes as not planned.

## Planning release notes

### New Features
Documented product inventory, architecture, delivery sequencing, reusable issue template and 20 linked implementation issues using the requested issue structure. Created and repository-linked project #61 with the template's board/table views and exact status columns.

### Fixed Bugs
No application code has been changed; prototype production gaps are specified for implementation.

### Known Issues
Atlas integration and GDS build credentials are not yet verified. Vercel framework is not set. Application features are not implemented. Email/postal transport is not configured. Project #61 is created, linked and populated; its eight status columns and 20 active issue placements have been verified.

### Future Roadmap
Execute #1–#19 in dependency order; resolve #20 before claiming external email support; scope future postal fulfillment, payments and commerce imports separately.

## Planning verification record

- Repository API confirms 20 open implementation issues, each with all 26 numbered sections.
- Project UI confirms Roadmap=1 (#20), Backlog=16 (#4–#19), Todo=3 (#1–#3), all other active columns=0.
- Repository Projects listing confirms one linked project: DiscountDirect #61.
- A reusable template is committed at .github/ISSUE_TEMPLATE/implementation.md.
- This documentation-only planning task does not deploy or implement the application; production delivery is explicitly tracked in the implementation issues.
