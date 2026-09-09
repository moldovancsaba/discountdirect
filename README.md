# DiscountDirect

Personalized offers and seller–buyer relationships. Purchase-ledger release **0.6.0**.

- [Application](https://discountdirect.vercel.app)
- [General Dashboard](https://discountdirect.vercel.app/admin) — requires the operator key from `.env.local`
- [Repository project board](https://github.com/moldovancsaba/discountdirect/projects)
- [Implementation plan](IMPLEMENTATION_PLAN.md)
- [Release notes](RELEASE_NOTES.md)
- [Architecture](docs/architecture.md) · [Setup and operations](docs/operations.md)
- [Authentication and provisioning](docs/authentication.md)
- [Purchase ledger](docs/purchases.md)

Built with Next.js, React, TypeScript and MongoDB Atlas/Mongoose; hosted on the existing Vercel project. Socket.IO and business features follow the issue plan. GDS is temporarily deferred by explicit user instruction; its adoption remains in issue #3.

## Run

Node 24 and pnpm 10.30.3 are required. Preserve an existing `.env.local`; use `.env.example` only to create a missing configuration. Set `MONGODB_URI` and `OPERATIONS_TOKEN` without committing their values.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm db:check
pnpm dev
```

No demo/customer data is created by this release. Authorized sellers can manage products, import purchase lines, review seller-scoped customer histories, record corrections and refunds, and control a customer record's privacy status. Buyers can see only purchases linked to their own active seller relationship and normalized account email. Messages, offers and campaigns are not yet available.
