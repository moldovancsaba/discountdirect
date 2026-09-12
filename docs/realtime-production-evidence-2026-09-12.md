# Realtime production evidence - 2026-09-12

## Go/no-go decision

Decision: go for production realtime on the existing Vercel project.

Production alias: `https://discountdirect.vercel.app`

Verified deployment: `dpl_4HtzhSAkAy8htM3WWmt8N7JjEqAS`

Source commit: `3754e2d` plus the probe-only evidence commit that updates this file.

Vercel project evidence:

- Project: `narimato/discountdirect` (`prj_CR4pyuYeYlbO0WcvW5qBoD9zq36A`).
- Plan: Pro.
- Runtime region: `iad1`.
- Fluid Compute: enabled.
- Default function timeout: 300 seconds.
- `REALTIME_ENABLED` exists in Production and is encrypted.
- `api/socket-io.ts` has `maxDuration` 300 in `vercel.json`.

Vercel documentation reviewed: WebSockets are a Vercel Functions beta capability, require Fluid Compute, support Socket.IO with WebSocket transport, reconnects can land on another instance, and durable external state is required for cross-instance coordination. Sources: [Vercel WebSockets documentation](https://vercel.com/docs/functions/websockets) and [Vercel Functions WebSocket support note](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections).

## Production checks

Manual WebSocket upgrade against the production alias returned `101 Switching Protocols` on `/api/socket-io?EIO=4&transport=websocket`.

`pnpm test:realtime-production -- --base-url=https://discountdirect.vercel.app --require-distinct-runtime` passed at `2026-09-12T15:36:05.587Z` with synthetic accounts and cleanup.

Probe result:

- Authenticated WebSocket handshake: pass.
- Authorized room subscription: pass.
- Two clients on distinct Vercel runtime instances: pass.
- Atlas-backed `message.created` live fanout: pass.
- Presence heartbeat: pass.
- Reconnect cursor replay: pass.
- Unauthorized subscription rejection: pass.

Runtime evidence:

- Seller runtime: `dpl_4HtzhSAkAy8htM3WWmt8N7JjEqAS:4b942efd-be4e-4143-b2e8-5820c4bf61fa`.
- Buyer runtime: `dpl_4HtzhSAkAy8htM3WWmt8N7JjEqAS:8791019a-06e0-4d44-8525-a3e302815fa4`.
- Replay runtime: `dpl_4HtzhSAkAy8htM3WWmt8N7JjEqAS:4b942efd-be4e-4143-b2e8-5820c4bf61fa`.

Concurrent sampling before the strict probe ran eight production probes successfully and observed five distinct runtime instances on the public alias.

## Release verification

- `pnpm check`: passed.
- `pnpm test:auth-integration`: passed.
- `pnpm db:indexes`: passed.
- `pnpm db:restore-drill`: passed using disposable `dd_restore_441e1b679b`.
- `pnpm ops:monitor`: passed against production release `1.5.0`.
- `pnpm test:quality-release`: passed against production release `1.5.0`.
- `git diff --check`: passed before the evidence update.

## Recovery

Realtime is not the source of truth. Durable HTTP conversation reads and writes remain authoritative.

Immediate disable procedure:

1. Set `REALTIME_ENABLED=false` in Vercel Production.
2. Redeploy production.
3. Run `pnpm ops:monitor` and `pnpm test:quality-release`.
4. Leave durable conversations available while investigating `api/socket-io.ts`, Atlas change streams, Vercel WebSocket status and production logs.

Rollback target before this release: `dpl_JE3Y5ctssB43zTBj83Hev4UQQAUk` for the verified 1.4.1 access release. Prefer the latest verified 1.5.0 deployment if only the final evidence commit is suspect.
