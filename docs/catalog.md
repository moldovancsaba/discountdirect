# Seller catalog and JSON import

Only users with an active membership for the seller can read or change that seller’s catalog. The seller workspace lists active and archived products and exposes create, edit, archive and import controls. Products use a seller-scoped unique SKU, integer HUF price, non-negative integer stock, category, compatibility labels, active state and optimistic version number.

## JSON import version 1

Paste an array of 1–100 objects into the seller workspace. Each row has this shape:

```json
{
  "sku": "SKU-1",
  "name": "Termék neve",
  "priceHuf": 12990,
  "stock": 5,
  "category": "Kategória",
  "compatibleWith": ["SKU-2"],
  "active": true
}
```

Preview stores an `ImportBatch` with schema version, source checksum, creator, seller, expected product versions and a result for every row. It does not alter products. Apply runs in an Atlas transaction. Replaying an applied batch is harmless; applying a preview after a newer manual edit fails as stale instead of overwriting it. Duplicate SKUs inside one file, malformed fields and batches over 100 rows cannot be applied.

Every created, edited, archived or imported product writes a versioned `ProductRevision`. To correct an import, edit the affected products using their current versions. Revisions preserve the recovery record. Archived products remain available for historical offer snapshots but are excluded from active-product reads.

## HTTP routes

- `GET/POST /api/sellers/{sellerSlug}/products`
- `PATCH /api/sellers/{sellerSlug}/products/{productId}`
- `POST /api/sellers/{sellerSlug}/products/import`

Cookie-authenticated writes require the same origin. Errors use the standard `{error:{code,message,requestId}}` shape. Request bodies are bounded to 16 KiB for individual products and 256 KiB for imports.
