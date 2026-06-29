# Catalog update flow

Use this when changing an existing Autumn catalog through MCP/API or when mapping an `atmn push` preview back to tool params. For a single plan edit, use the same flow with `plans.preview_update` and `plans.update`.

## Loop

1. Inspect the current catalog and the proposed catalog.
2. Build `catalog.preview_update` params: `features`, `plans`, optional `skip_deletions`, `skip_feature_ids`, `skip_plan_ids`, `expand`.
3. Run `catalog.preview_update`; never skip this before a write.
4. Summarize the preview and ask for decisions per feature and per base plan family.
5. Revise params or config based on the decisions, then preview again if anything changed.
6. Run `catalog.update` with the exact previewed params, following the global write approval rules.

For `plans.preview_update`, include `include_versions: true` and `include_variants: true` when the plan has customers, historical versions, or variants so the user can choose the right scope. `catalog.preview_update` accepts the same per-plan detail flags inside each plan in `plans[]`.

## Preview summary checklist

- Feature changes: created, updated, skipped, removed, archived, and any blockers.
- Plan changes: created, updated, deleted, skipped, unchanged, and whether deletion archives because customers exist.
- For each changed plan: `customize`, `price_change`, `item_changes`, `previous_attributes`, `has_customers`, `customer_count`, and `versionable`.
- Variants: affected variant IDs, `will_apply`, `plan.variants[n].update_source` (`direct` vs `propagated`), conflicts, and whether selected variants have customers.
- Other versions: historical versions that can receive the same diff.
- Migration: whether preview returned a draft, which plan IDs it covers, whether it includes custom plans, and whether billing changes exist.

## Per-plan family decisions

For each changed base plan or plan family, ask decisions in the same order as the dashboard:

1. Versioning strategy.
2. Variant handling: propagation choices for `propagated` variants, standalone update choices for `direct` variants.
3. Migration draft.

### Versioning

Use `versionable`, `has_customers`, `customer_count`, and `other_versions` to explain why this matters.

- Create new version: omit `disable_version`; existing customers remain on their current version.
- Update current version: send `disable_version: true`; existing customers keep their rows unless a migration draft is created and run.
- Update all versions: send `all_versions: true`; do not combine with `disable_version`.
- Force a new version even without customers only when the user explicitly asks: `force_version: true`.
- Skip a plan by adding its ID to `skip_plan_ids`, then preview again.

`create_version` is usually the safest live choice because it grandfathers existing customers. `update_current` and `update_all_versions` patch existing versions, so they may need a migration draft if customers should move to the new shape.

### Variant propagation

- `update_variant_ids` propagates the base plan diff to selected variant plan IDs.
- `variants` contains direct variant updates or new variant definitions under the base plan.
- If `plan.variants[n].update_source` is `propagated`, the variant would receive the base plan diff. Show its ID/name, customer impact, item/price changes, and conflicts, then ask whether to include it in `update_variant_ids`.
- Default to selecting conflict-free propagated variants only. Ask explicitly before propagating into variants with conflicts.
- If `plan.variants[n].update_source` is `direct`, treat it like updating that variant plan itself. It can have its own `create_version` / `update_current` choice and its own migration draft question when it has customers.
- Variants cannot use `update_all_versions` in atmn headless mode.

### Migration

If updating in place or all versions and the user wants affected customers moved, include `migration: { "draft": true }`. Add `include_custom: true` only when the user explicitly wants custom plan versions included.

Migration drafts do not move customers by themselves. The returned migration must be reviewed/run separately.

## Dashboard plan edit flow

Mirror the dashboard's `PlanChangeDialog` when asking a human:

1. Review the backend preview: price, item, trial, billing control, and settings changes.
2. Choose strategy: create a new version, update the current version, or update all versions.
3. Choose variant propagation when variants exist; default to conflict-free variants only.
4. Review migration targets. If customers should move, create a migration draft and send the user to run/review it.
5. Apply the write with the exact previewed params, following the global write approval rules.

Metadata-only edits apply across all versions and variants. A past version cannot create a new version from the dashboard flow; update that version or all versions instead.

## API param mapping

```json
{
  "plan_id": "pro",
  "price": { "amount": 29, "interval": "month" },
  "items": [],
  "disable_version": true,
  "update_variant_ids": ["pro_annual"],
  "migration": { "draft": true }
}
```

- New version: remove `disable_version`, `all_versions`, and `migration` unless explicitly needed.
- Update current version: set `disable_version: true`.
- Update all versions: set `all_versions: true`; remove `disable_version`.
- Propagate to variants: set `update_variant_ids` to the selected variant plan IDs.
- Directly update variants: include `variants[]` under the base plan.
- Migration draft: set `migration: { "draft": true }` on the plan, or use top-level catalog `migration` only when every relevant plan should share it.
- Skip a plan or variant: add its ID to `skip_plan_ids`.

Direct variant migration drafts cannot be mixed with incompatible direct variant updates; follow the preview/tool error and split the work if needed.

## catalog.update ordering

`catalog.update` applies features first, then plans, then missing plan removals, then missing feature removals. With `skip_deletions: false`, missing plans/features are removed; customer-bearing plans are archived instead of deleted.

`catalog.preview_update` previews feature writes first and then plan writes, so plan previews can reference features created in the same catalog update. `catalog.update` follows the same ordering.
