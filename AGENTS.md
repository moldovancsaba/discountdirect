# AGENTS.md: DiscountDirect

> `AGENTS.md` is the canonical agent-instructions file. `CLAUDE.md` is an identical copy for Claude Code: edit `AGENTS.md`, then run `cp AGENTS.md CLAUDE.md`.

## What this is
DiscountDirect is a seller-buyer relationship and personalized-offer application: sellers use their own customers' purchase history to send individual offers, flash campaigns and offer lists; buyers converse and accept or decline. Each seller sees only its own customers. Next.js 15 App Router, React 19, TypeScript, MongoDB Atlas/Mongoose, SovereignSquad GDS 6.7.0, Vercel. UI language is Hungarian. See [README.md](README.md) and [HANDOVER.md](HANDOVER.md).

Names that all refer to this project: local folder `discount.direct`, GitHub repo `moldovancsaba/discountdirect`, npm package `discountdirect`, Vercel project `narimato/discountdirect`.

## Commands
Node 24.x and pnpm 10.30.3 only (`package.json`); never use npm or yarn. The `npm` commands in `.github/ISSUE_TEMPLATE/implementation.md` are stale.
- `pnpm install --frozen-lockfile`: install.
- `pnpm dev`: local server. `pnpm db:check`: read-only Atlas ping (needs `.env.local`).
- `pnpm test`: domain tests (`tests/*.test.ts`). `pnpm lint`, `pnpm typecheck`: single checks.
- `pnpm check`: the gate (lint, typecheck, test, GDS manifest, GDS compliance, build). CI runs it on every push and pull request (`.github/workflows/quality.yml`).
- Release and ops checks (need real environment values; synthetic data only): `pnpm release:readiness`, `pnpm ops:monitor`, `pnpm test:smoke`, `pnpm test:auth-integration`, `pnpm test:email-integration`, `pnpm redis:verify`, `pnpm blob:verify`. Details in [docs/operations.md](docs/operations.md).

## Branch, push, deploy
- `main` is the release branch ([docs/architecture.md](docs/architecture.md)). Production deploys with `vercel deploy --prod --scope narimato` after the gate passes ([docs/operations.md](docs/operations.md)).
- The repo's closure bar is: tested, documented, committed, pushed and verified on an exact-commit Vercel Preview; production verification only when the change is intentionally release-enabled ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)). The push step belongs to the owner unless they ask you to do it.

## Commit identity and attribution
- Commits must be authored as `moldovancsaba <moldovancsaba@gmail.com>`. Run `git config user.email` first; if it differs, set it locally with `git config user.email moldovancsaba@gmail.com && git config user.name moldovancsaba`.
- No AI attribution anywhere: no `Co-Authored-By`, no "generated with/by", no model or provider names in commit messages, files, comments or docs. Commit messages describe the change only.

## Tracking: one repo, one board
- The one board is [project #61](https://github.com/users/moldovancsaba/projects/61). Never create a second board; track work as issues and board items.
- Status columns, in order: IDEABANK (SOMEDAY), Roadmap (LATER), Backlog (SOONER), Todo (NEXT), In Progress (NOW), Review (ALMOST), Done, Declined (NEVER). A merged pull request moves to Review (ALMOST); Done requires production evidence; Declined records a reason ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)).

## Rules from the repo docs
- UI: GDS packages only, one root provider, token-only local CSS, no parallel UI library. `pnpm gds:check` enforces it against `gds-adoption.json`; `@tabler/icons-react` is banned in `src`.
- Authorization is server-side and seller-scoped: every query and mutation checks the exact seller membership or buyer relationship. Never trust a client-supplied role, price or seller id. A new Route Handler or Server Action must be classified in the access-policy matrix or CI fails ([docs/architecture.md](docs/architecture.md)).
- MongoDB is authoritative. Redis only accelerates (counters, rate limits, locks) and must degrade without changing decisions ([docs/operations.md](docs/operations.md)).
- Money is integer HUF; timestamps are UTC; presentation is Europe/Budapest.
- Writes that can be retried must be idempotent and use optimistic versions; state changes append events instead of rewriting evidence.
- Never claim what has no evidence: an outbox row is `sent` only after provider acceptance; `posted` is a postal handoff, not recipient delivery; an accepted offer is not a payment.
- Secrets stay server-only. Never log or commit secrets, tokens, signed URLs, buyer content or raw e-mail addresses. New variables go into `.env.example` as names only.
- Test with synthetic data. Never message real customers; prototype fixtures refuse to load into production ([docs/operations.md](docs/operations.md)).
- When stack, deployment, routes, environment variables, domain models, provider contracts or durable state change, update [docs/implementation-baseline.md](docs/implementation-baseline.md) in the same change. Record changes in [RELEASE_NOTES.md](RELEASE_NOTES.md), the repo's changelog (New Features, Fixed Bugs, Known Issues, Future Roadmap).

## Do not
- Do not commit or print the contents of `.env.local`, `.env.production.local` or `.vercel/`. Preserve an existing `.env.local`; `.gitignore` excludes `.env*` except `.env.example`.
- Do not add services, frameworks, local demo persistence fallbacks, hardcoded credentials or silent authorization bypasses ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)).
- Do not force-unlock leases, rewind a production connector cursor without documenting the provider range and using a new idempotency key, edit a published rule-template version, or flush Redis keys outside `camp:`, `cap:`, `lock:` and `rate:` ([docs/operations.md](docs/operations.md)).
- Do not mark delivery rows sent by hand.

## Where things live
[docs/INDEX.md](docs/INDEX.md) lists every document. Start with [docs/implementation-baseline.md](docs/implementation-baseline.md) (current stack, routes, models, gaps) and [docs/operations.md](docs/operations.md) (setup, recovery, deploy). [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) is historical. Code: `src/<domain>/` (service, models, http), `src/app/` (routes), `api/socket-io.ts` (realtime), `scripts/` (ops and verification), `tests/`.
