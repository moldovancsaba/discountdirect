# Versioned rule templates

`RuleTemplate` points to one immutable published `RuleTemplateVersion`. Seller settings retain the runtime-compatible effective snapshot plus template key/version, override mode, override values and legal-lock provenance. Every save appends a `RuleResolutionEvent` with changed paths and a SHA-256 of the resolved result.

Predefined mode inherits the active template. Advanced mode deep-merges validated seller values, then restores non-overridable consent scope and secure checkout mode and clamps channel frequency caps to the template maxima. Unknown keys and invalid ranges fail before persistence.

Seller owners may preview, save or revert through the existing settings surface and optimistic version. `POST /api/sellers/:sellerSlug/settings/preview` resolves a proposed mode and value without writing. Platform operators publish immutable versions through `/api/admin/rule-templates`; only inactive versions may be retired. Existing seller snapshots continue to identify their source version, making rollback a template activation and seller re-resolution operation rather than an in-place historical edit.
