# Operations alerts

Release 1.4.0 uses the General Dashboard, Vercel deployment state and a Codex heartbeat monitor for production health. Alerts must never include secrets, buyer content, raw e-mail addresses, activation links or request bodies.

Active Codex heartbeat: `discountdirect-production-health-monitor`. It runs every 30 minutes and stays quiet while checks remain healthy.

## Owners and channels

| Owner | Channel | Scope |
| --- | --- | --- |
| DiscountDirect operator | Codex heartbeat task in this workspace | Continuous health, readiness and cron authorization checks. |
| DiscountDirect operator | GitHub issue comment on the affected issue | Release evidence, follow-up action and closure notes. |
| DiscountDirect operator | Vercel project activity | Deployment, rollback and runtime failures. |

## Monitor command

Run manually or from the heartbeat:

```sh
pnpm ops:monitor
```

The command checks production liveness, unauthorized readiness, authorized readiness, unauthorized cron and authorized cron. It reads local production tokens from `.env.production.local` or the process environment and prints only status metadata, never token values.

## Alert thresholds

| Signal | Alert when | Recovery |
| --- | --- | --- |
| Liveness | `/api/health/live` is not HTTP 200, status is not `ok`, or version is not `1.4.0`. | Inspect the current Vercel deployment. If the latest deployment is faulty, roll back to the latest verified Ready deployment and open a GitHub issue with the deployment ID. |
| Readiness authorization | `/api/health/ready` without a token is not HTTP 401. | Treat as an access-control regression. Roll back if production behavior changed, then inspect `src/app/api/health/ready/route.ts`. |
| Database readiness | Authenticated `/api/health/ready` is not HTTP 200 or `database.connected` is false. | Check Vercel `MONGODB_URI`, Atlas user/database/network posture, then rerun `pnpm db:check`. Do not print the URI. |
| Cron authorization | `/api/cron/automations` without a token is not HTTP 401. | Treat as an access-control regression and roll back if production behavior changed. |
| Cron execution | Authorized cron is not HTTP 200, response lacks `results`, or Vercel Cron stops invoking for more than two expected intervals. | Check `CRON_SECRET`, `vercel.json`, Vercel cron status and `/api/cron/automations?limit=1` manually. |
| Delivery outbox | Dashboard shows retryable rows older than two hours or terminal failures above zero. `TRANSPORT_NOT_CONFIGURED` is not a failure before issue #20. | Inspect seller delivery log, confirm current consent, and leave rows honest; do not mark external sends successful without provider evidence. |
| Automation backlog | Active automations have due schedules older than two cron intervals. | Run authorized cron with `limit=1`, then inspect automations and Atlas connectivity. |
| Redemption | Seller reports a coupon code that cannot be confirmed and is not safely unknown/expired/redeemed. | Use seller redemption screen; never log raw coupon codes in issue comments. |

## Escalation notes

- One isolated transient failure can be retried once after one minute.
- Two consecutive failures or any access-control failure require an issue comment with the check name, timestamp, deployment ID and recovery action.
- Rollback uses the procedure in `docs/operations.md`; restore the intended deployment after the exercise or incident is complete.
- If the heartbeat is healthy, it stays quiet. It should notify only on failure, recovery after failure, or required user action.
