# Marketplace inbox

The buyer inbox supports `aggregate` and `per_seller` modes. `InboxPreference` is buyer-owned and stores only the selected mode, selected seller and optimistic version; it does not grant access.

Every read resolves active `BuyerRelationship` records and active sellers first. Aggregate mode queries only that derived seller set. Per-seller mode accepts a stored seller only while the relationship remains active; a revoked or disabled seller causes an explicit recovered aggregate state. The browser cannot supply an authoritative seller filter.

`GET /api/buyer/inbox` returns bounded conversations, offers and lists with seller identity. Conversation pagination uses the stable `(lastEventAt, _id)` cursor. `GET/PATCH /api/buyer/inbox-preference` reads or updates the optimistic preference contract. Concurrent stale updates fail without widening scope.

Rollback may hide the mode control and default reads to aggregate mode. Deleting a preference changes no conversation, offer, list, consent or relationship record.
