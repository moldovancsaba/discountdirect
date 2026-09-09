# Purchase ledger

Release 0.6.0 stores customer identities and purchase lines within one seller boundary. A customer is unique by seller and the source system's buyer ID. The same normalized email may occur for different sellers without joining their profiles.

## Import contract

Seller members open `/seller/{sellerSlug}/customers`, provide a source name and preview JSON with schema version `1`. A batch accepts 1–200 rows. Each row requires `externalBuyerId`, `buyerName`, `orderId`, `lineId`, `productSku`, `productName`, a UTC-compatible `purchasedAt`, positive integer `quantity`, and non-negative integer `totalHuf`. `buyerEmail` is optional and normalized when present.

The preview records a checksum and per-row create, unchanged, or error result. Applying a valid batch runs in one Atlas transaction and is safe to replay. The unique seller, order and line index rejects duplicate commercial lines. An unknown product SKU is retained as a historical name/SKU snapshot with no product link; this preserves imports from discontinued or missing catalog entries.

## History and corrections

Seller APIs and screens enforce active membership for the requested seller. Customer history returns 1–100 rows in descending purchase time. A refund or correction records an explicit reason, actor, timestamp and incremented version. It does not delete or overwrite the imported evidence, and only rows still in `purchased` state can be changed. Customer spend includes only `purchased` rows.

Buyers require an active `BuyerRelationship` for the seller. Their page resolves only the customer record whose normalized email matches their authenticated account inside that seller. Records from another seller are never combined.

## Privacy interaction

Seller operators can mark a customer record active, restricted, or erasure requested. Financial evidence remains retained while the wider preference, export, retention and erasure workflow is completed in issue #7. Restricted and erasure-requested status is persisted now so later scoring and delivery work can exclude those records by default.
