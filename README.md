# DiscountDirect

Personalized offers and seller–buyer relationships. Explainable recommendation preview release **0.9.0**.

- [Application](https://discountdirect.vercel.app)
- [General Dashboard](https://discountdirect.vercel.app/admin) — requires the operator key from `.env.local`
- [Repository project board](https://github.com/moldovancsaba/discountdirect/projects)
- [Implementation plan](IMPLEMENTATION_PLAN.md)
- [Release notes](RELEASE_NOTES.md)
- [Architecture](docs/architecture.md) · [Setup and operations](docs/operations.md)
- [Authentication and provisioning](docs/authentication.md)
- [Purchase ledger](docs/purchases.md)
- [Privacy and channel preferences](docs/privacy.md)
- [Recommendation rules](docs/recommendations.md)

Built with Next.js, React, TypeScript, MongoDB Atlas/Mongoose and SovereignSquad GDS 6.7.0; hosted on the existing Vercel project. The application uses the GDS `mint` preset (Mint circuit), Hungarian locale, one root provider, governed components and token-only local layout CSS. Socket.IO and later business features follow the issue plan.

## Run

Node 24 and pnpm 10.30.3 are required. Preserve an existing `.env.local`; use `.env.example` only to create a missing configuration. Set `MONGODB_URI` and `OPERATIONS_TOKEN` without committing their values.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm db:check
pnpm dev
```

`pnpm check` includes the GDS ESLint rules, strict adoption-manifest validation, consumer compliance scan, TypeScript, domain tests and the production build. GDS packages are pinned to the official 6.7.0 release bundle so local, GitHub Actions and Vercel installs are reproducible.

No demo/customer data is created by this release. Authorized sellers can manage products, purchase histories and privacy requests within their own seller scope. They can also create a stored, reproducible recommendation preview for a selected customer and consented channel. Buyers manage seller-specific marketing consent and data requests. Messages, offers and campaigns are not yet available, and previews never send anything.
